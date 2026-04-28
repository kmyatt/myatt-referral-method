import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import {
  BillingEventStatus,
  BillingEventType,
  PlatformFeeStatus,
  SubscriptionStatus,
} from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log-service";
import {
  handleSubscriptionStatusChange,
  mapStripeSubscriptionStatus,
} from "@/lib/billing-service";
import { decimalToNumber } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { logReferralDebug } from "@/lib/referral-debug";
import { buildAbsoluteUrl, getStripeClient, isStripeConfigured } from "@/lib/stripe";
import type { StripeEventContext } from "@/lib/stripe-webhook-service";

type DbClient = typeof prisma | Prisma.TransactionClient;
type StripeClientLike = Pick<Stripe, "coupons" | "subscriptions" | "invoices">;
type AuditLogger = typeof createAuditLog;
type SubscriptionStatusChangeResult = Awaited<
  ReturnType<typeof handleSubscriptionStatusChange>
>;
type SubscriptionStatusChangeHandler = typeof handleSubscriptionStatusChange;

type StripeServiceDependencies = {
  db?: DbClient;
  stripeClient?: StripeClientLike | null;
  auditLogger?: AuditLogger;
  subscriptionStatusChangeHandler?: SubscriptionStatusChangeHandler;
};

type StripeSubscriptionDiscountRecord = {
  discountId: string;
  couponId: string | null;
};

export type SyncStripeDiscountResult = {
  synced: boolean;
  noChange?: boolean;
  reason?: string;
  stripeSubscriptionId?: string;
  requestedDiscountPercent: number;
  appliedDiscountPercent: number;
  couponId: string | null;
  removedMyattDiscountIds: string[];
  preservedDiscountIds: string[];
};

type StripeDiscountVerificationResult = {
  matches: boolean;
  expectedEffectivePriceCents: number;
  actualInvoiceTotalCents: number | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
};

type StripeBillingLogLevel = "info" | "warn" | "error";

const MYATT_REFERRAL_COUPON_SOURCE = "myatt_referral_method";
const BILLING_LOG_DISCOUNT_SYNC_BEFORE_INVOICE = "DISCOUNT_SYNC_BEFORE_INVOICE";
const BILLING_LOG_DISCOUNT_MISMATCH_DETECTED = "DISCOUNT_MISMATCH_DETECTED";
const BILLING_LOG_INVOICE_ALREADY_FINALIZED_SKIP = "INVOICE_ALREADY_FINALIZED_SKIP";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function getDbClient(input: StripeServiceDependencies = {}) {
  return input.db ?? prisma;
}

function getStripeBillingClient(input: StripeServiceDependencies = {}) {
  return input.stripeClient ?? getStripeClient();
}

function getAuditLogger(input: StripeServiceDependencies = {}) {
  return input.auditLogger ?? createAuditLog;
}

function getSubscriptionStatusHandler(input: StripeServiceDependencies = {}) {
  return input.subscriptionStatusChangeHandler ?? handleSubscriptionStatusChange;
}

function logStripeBillingEvent(
  event: string,
  payload: Record<string, unknown>,
  level: StripeBillingLogLevel = "info",
) {
  logReferralDebug(event, payload);

  if (level === "error") {
    console.error(`[stripe-billing] ${event}`, JSON.stringify(payload));
    return;
  }

  if (level === "warn") {
    console.warn(`[stripe-billing] ${event}`, JSON.stringify(payload));
  }
}

function extractSubscriptionWindow(subscription: Stripe.Subscription) {
  const raw = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };

  return {
    currentPeriodStart: raw.current_period_start
      ? new Date(raw.current_period_start * 1000)
      : null,
    currentPeriodEnd: raw.current_period_end
      ? new Date(raw.current_period_end * 1000)
      : null,
  };
}

function extractInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const raw = invoice as unknown as {
    subscription?: string | { id: string } | null;
  };

  if (!raw.subscription) return null;

  return typeof raw.subscription === "string" ? raw.subscription : raw.subscription.id;
}

function extractInvoiceStatus(invoice: Stripe.Invoice) {
  const raw = invoice as Stripe.Invoice & {
    status?: string | null;
  };

  return raw.status ?? null;
}

function extractInvoiceTotalCents(invoice: Stripe.Invoice) {
  const raw = invoice as Stripe.Invoice & {
    total?: number | null;
    amount_paid?: number | null;
    amount_due?: number | null;
  };

  if (typeof raw.total === "number") {
    return raw.total;
  }

  if (typeof raw.amount_paid === "number") {
    return raw.amount_paid;
  }

  if (typeof raw.amount_due === "number") {
    return raw.amount_due;
  }

  return null;
}

function isInvoiceImmutable(invoiceStatus: string | null) {
  if (!invoiceStatus) {
    return false;
  }

  return invoiceStatus !== "draft";
}

function normalizeStripeDiscountPercent(discountPercent: number) {
  return Number(Math.max(0, Math.min(discountPercent, 100)).toFixed(2));
}

function formatMyattCouponName(discountPercent: number) {
  const label = normalizeStripeDiscountPercent(discountPercent)
    .toString()
    .replace(".", "_");

  return `MYATT_REFERRAL_${label}_PERCENT`;
}

function isStaleStripeEvent(input: {
  currentLastProcessedAt: Date | null;
  incomingEventCreatedAt: Date | null | undefined;
}) {
  if (!input.currentLastProcessedAt || !input.incomingEventCreatedAt) {
    return false;
  }

  return input.incomingEventCreatedAt < input.currentLastProcessedAt;
}

function canSyncStripeSubscription(status: Stripe.Subscription.Status) {
  return status !== "canceled" && status !== "incomplete_expired";
}

function extractStripeDiscounts(subscription: Stripe.Subscription) {
  const subscriptionWithDiscounts = subscription as Stripe.Subscription & {
    discounts?: {
      data?: Stripe.Discount[];
    };
  };

  return subscriptionWithDiscounts.discounts?.data ?? [];
}

async function resolveCouponForDiscount(
  stripe: StripeClientLike,
  discount: Stripe.Discount,
) {
  const discountWithCoupon = discount as Stripe.Discount & {
    coupon?: string | Stripe.Coupon | null;
  };

  if (!discountWithCoupon.coupon) {
    return null;
  }

  if (typeof discountWithCoupon.coupon === "string") {
    return stripe.coupons.retrieve(discountWithCoupon.coupon);
  }

  return discountWithCoupon.coupon;
}

function isMyattReferralCoupon(coupon: Stripe.Coupon | null) {
  return coupon?.metadata?.source === MYATT_REFERRAL_COUPON_SOURCE;
}

async function partitionStripeDiscounts(
  stripe: StripeClientLike,
  subscription: Stripe.Subscription,
) {
  const myattDiscounts: StripeSubscriptionDiscountRecord[] = [];
  const preservedDiscounts: StripeSubscriptionDiscountRecord[] = [];

  for (const discount of extractStripeDiscounts(subscription)) {
    const coupon = await resolveCouponForDiscount(stripe, discount);
    const record = {
      discountId: discount.id,
      couponId: coupon?.id ?? null,
    };

    if (isMyattReferralCoupon(coupon)) {
      myattDiscounts.push(record);
      continue;
    }

    preservedDiscounts.push(record);
  }

  return {
    myattDiscounts,
    preservedDiscounts,
  };
}

async function ensureStripeCouponForDiscount(
  stripe: StripeClientLike,
  input: {
    businessId: string;
    subscriptionId: string;
    discountPercent: number;
  },
) {
  if (input.discountPercent <= 0) {
    return null;
  }

  const couponName = formatMyattCouponName(input.discountPercent);
  const percentOff = normalizeStripeDiscountPercent(input.discountPercent);
  const coupons = await stripe.coupons.list({ limit: 100 });
  const existing = coupons.data.find(
    (coupon) =>
      coupon.name === couponName &&
      coupon.percent_off === percentOff &&
      coupon.metadata?.source === MYATT_REFERRAL_COUPON_SOURCE &&
      coupon.metadata?.businessId === input.businessId &&
      coupon.metadata?.subscriptionId === input.subscriptionId,
  );

  if (existing) {
    return existing.id;
  }

  const coupon = await stripe.coupons.create({
    duration: "forever",
    percent_off: percentOff,
    name: couponName,
    metadata: {
      source: MYATT_REFERRAL_COUPON_SOURCE,
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
    },
  });

  return coupon.id;
}

async function resolveExistingLocalSubscriptionForStripe(
  stripeSubscription: Stripe.Subscription,
  db: DbClient,
) {
  const existing = await db.subscription.findUnique({
    where: {
      stripeSubscriptionId: stripeSubscription.id,
    },
  });

  if (existing) {
    return existing;
  }

  const stripeCustomerId =
    typeof stripeSubscription.customer === "string"
      ? stripeSubscription.customer
      : null;
  const stripePriceId = stripeSubscription.items.data[0]?.price?.id ?? null;

  if (!stripeCustomerId) {
    return null;
  }

  const customer = await db.customer.findUnique({
    where: { stripeCustomerId },
    select: { id: true },
  });

  if (!customer) {
    return null;
  }

  return db.subscription.findFirst({
    where: {
      customerId: customer.id,
      deletedAt: null,
      OR: [
        stripePriceId ? { stripePriceId } : undefined,
        stripePriceId ? { plan: { stripePriceId } } : undefined,
        { stripeSubscriptionId: null },
      ].filter(Boolean) as Prisma.SubscriptionWhereInput[],
    },
    orderBy: { createdAt: "desc" },
  });
}

async function upsertSubscriptionFromStripe(
  stripeSubscription: Stripe.Subscription,
  eventContext: StripeEventContext = {},
  input: StripeServiceDependencies = {},
) {
  const db = getDbClient(input);
  const existing = await resolveExistingLocalSubscriptionForStripe(
    stripeSubscription,
    db,
  );
  const stripeCustomerId =
    typeof stripeSubscription.customer === "string"
      ? stripeSubscription.customer
      : null;

  if (!existing || !stripeCustomerId) {
    return null;
  }

  if (
    isStaleStripeEvent({
      currentLastProcessedAt: existing.lastStripeEventCreatedAt,
      incomingEventCreatedAt: eventContext.eventCreatedAt,
    })
  ) {
    logReferralDebug("stripe.subscription.stale_ignored", {
      subscriptionId: existing.id,
      stripeSubscriptionId: stripeSubscription.id,
      currentLastProcessedAt: existing.lastStripeEventCreatedAt?.toISOString() ?? null,
      incomingEventCreatedAt: eventContext.eventCreatedAt?.toISOString() ?? null,
      incomingStatus: stripeSubscription.status,
    });

    return {
      subscription: existing,
      ignoredStale: true,
    };
  }

  const price = stripeSubscription.items.data[0]?.price;
  const status = mapStripeSubscriptionStatus(stripeSubscription.status);
  const { currentPeriodStart, currentPeriodEnd } =
    extractSubscriptionWindow(stripeSubscription);

  return {
    ignoredStale: false,
    subscription: await db.subscription.update({
      where: {
        id: existing.id,
      },
      data: {
        stripeCustomerId,
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: price?.id ?? existing.stripePriceId,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        basePriceCents: price?.unit_amount ?? existing.basePriceCents,
        effectivePriceCents:
          existing.currentDiscountPercent &&
          decimalToNumber(existing.currentDiscountPercent) > 0
            ? existing.effectivePriceCents
            : price?.unit_amount ?? existing.effectivePriceCents,
        lastStripeEventCreatedAt:
          eventContext.eventCreatedAt ?? existing.lastStripeEventCreatedAt,
        canceledAt: status === SubscriptionStatus.CANCELED ? new Date() : null,
        pausedAt: status === SubscriptionStatus.PAUSED ? new Date() : null,
      },
    }),
  };
}

function buildStripeDiscountUpdatePayload(input: {
  preservedDiscountIds: string[];
  couponId: string | null;
}) {
  return [
    ...input.preservedDiscountIds.map((discountId) => ({ discount: discountId })),
    ...(input.couponId ? [{ coupon: input.couponId }] : []),
  ] as Stripe.SubscriptionUpdateParams.Discount[];
}

function collectSubscriptionIdsForSync(
  primarySubscriptionId: string,
  recalculationResult: SubscriptionStatusChangeResult | null,
) {
  const subscriptionIds = new Set<string>();
  subscriptionIds.add(primarySubscriptionId);

  for (const result of recalculationResult?.results ?? []) {
    if (result.subscriptionId) {
      subscriptionIds.add(result.subscriptionId);
    }
  }

  return [...subscriptionIds];
}

async function syncSubscriptionIdsToStripe(
  subscriptionIds: string[],
  input: StripeServiceDependencies = {},
) {
  const syncResults: SyncStripeDiscountResult[] = [];

  for (const subscriptionId of subscriptionIds) {
    syncResults.push(await syncStripeDiscount(subscriptionId, input));
  }

  return syncResults;
}

async function getSubscriptionWithBusiness(
  subscriptionId: string,
  db: DbClient,
) {
  return db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { business: true },
  });
}

async function getSubscriptionByStripeIdWithBusiness(
  stripeSubscriptionId: string,
  db: DbClient,
) {
  return db.subscription.findUnique({
    where: { stripeSubscriptionId },
    include: { business: true },
  });
}

async function retrieveStripeInvoice(
  stripe: StripeClientLike | null,
  invoice: Stripe.Invoice,
) {
  if (!stripe || !invoice.id) {
    return invoice;
  }

  return stripe.invoices.retrieve(invoice.id);
}

async function createBillingDiscrepancyEvent(
  subscription: NonNullable<Awaited<ReturnType<typeof getSubscriptionWithBusiness>>>,
  input: {
    eventType: typeof BILLING_LOG_DISCOUNT_MISMATCH_DETECTED | typeof BILLING_LOG_INVOICE_ALREADY_FINALIZED_SKIP;
    billingStatus: BillingEventStatus;
    invoiceId?: string | null;
    relatedStripeEventId?: string | null;
    expectedEffectivePriceCents: number;
    actualInvoiceTotalCents: number | null;
    invoiceStatus: string | null;
    reason: string;
    severity: "warning" | "critical";
    metadata?: Record<string, unknown>;
  },
  db: DbClient,
) {
  return db.billingEvent.create({
    data: {
      businessId: subscription.businessId,
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      type: BillingEventType.MANUAL_ADJUSTMENT,
      status: input.billingStatus,
      stripeInvoiceId: input.invoiceId ?? undefined,
      amountCents: input.actualInvoiceTotalCents ?? undefined,
      discountPercent: subscription.currentDiscountPercent,
      discountAmountCents:
        subscription.basePriceCents - subscription.effectivePriceCents,
      effectivePriceCents: input.expectedEffectivePriceCents,
      metadata: json({
        logType: input.eventType,
        reason: input.reason,
        severity: input.severity,
        manualReviewRequired: true,
        relatedStripeEventId: input.relatedStripeEventId,
        invoiceStatus: input.invoiceStatus,
        expectedEffectivePriceCents: input.expectedEffectivePriceCents,
        actualInvoiceTotalCents: input.actualInvoiceTotalCents,
        ...input.metadata,
      }),
    },
  });
}

async function verifyStripeInvoiceAgainstDbState(
  subscriptionId: string,
  invoice: Stripe.Invoice,
  input: StripeServiceDependencies = {},
): Promise<StripeDiscountVerificationResult | null> {
  const db = getDbClient(input);
  const subscription = await getSubscriptionWithBusiness(subscriptionId, db);

  if (!subscription) {
    return null;
  }

  return {
    matches: extractInvoiceTotalCents(invoice) === subscription.effectivePriceCents,
    expectedEffectivePriceCents: subscription.effectivePriceCents,
    actualInvoiceTotalCents: extractInvoiceTotalCents(invoice),
    invoiceId: invoice.id ?? null,
    invoiceStatus: extractInvoiceStatus(invoice),
  };
}

export async function ensureDiscountSyncedBeforeBilling(
  subscriptionId: string,
  options: {
    invoice?: Stripe.Invoice | null;
    reason: string;
    eventContext?: StripeEventContext;
  },
  input: StripeServiceDependencies = {},
) {
  const db = getDbClient(input);
  const stripe = getStripeBillingClient(input);
  const auditLogger = getAuditLogger(input);
  const subscription = await getSubscriptionWithBusiness(subscriptionId, db);

  if (!subscription) {
    throw new Error("Subscription not found.");
  }

  const initialSyncResult = await syncStripeDiscount(subscriptionId, input);
  logStripeBillingEvent(BILLING_LOG_DISCOUNT_SYNC_BEFORE_INVOICE, {
    subscriptionId,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    invoiceId: options.invoice?.id ?? null,
    reason: options.reason,
    requestedDiscountPercent: initialSyncResult.requestedDiscountPercent,
    appliedDiscountPercent: initialSyncResult.appliedDiscountPercent,
    noChange: initialSyncResult.noChange ?? false,
  });

  await auditLogger({
    businessId: subscription.businessId,
    actorCustomerId: subscription.customerId,
    action: "stripe.discount.ensure_before_billing",
    targetType: "Subscription",
    targetId: subscription.id,
    metadata: json({
      logType: BILLING_LOG_DISCOUNT_SYNC_BEFORE_INVOICE,
      invoiceId: options.invoice?.id ?? null,
      reason: options.reason,
      syncResult: initialSyncResult,
    }),
  });

  if (!options.invoice) {
    return {
      syncResult: initialSyncResult,
      verification: null,
      retried: false,
    };
  }

  const latestInvoice = await retrieveStripeInvoice(stripe, options.invoice);
  const verification = await verifyStripeInvoiceAgainstDbState(
    subscriptionId,
    latestInvoice,
    input,
  );

  if (!verification || verification.matches) {
    return {
      syncResult: initialSyncResult,
      verification,
      retried: false,
    };
  }

  if (isInvoiceImmutable(verification.invoiceStatus)) {
    logStripeBillingEvent(
      BILLING_LOG_INVOICE_ALREADY_FINALIZED_SKIP,
      {
        subscriptionId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        invoiceId: verification.invoiceId,
        invoiceStatus: verification.invoiceStatus,
        expectedEffectivePriceCents: verification.expectedEffectivePriceCents,
        actualInvoiceTotalCents: verification.actualInvoiceTotalCents,
        reason: options.reason,
      },
      "warn",
    );

    await createBillingDiscrepancyEvent(
      subscription,
      {
        eventType: BILLING_LOG_INVOICE_ALREADY_FINALIZED_SKIP,
        billingStatus: BillingEventStatus.PENDING,
        invoiceId: verification.invoiceId,
        relatedStripeEventId: options.eventContext?.eventId ?? null,
        expectedEffectivePriceCents: verification.expectedEffectivePriceCents,
        actualInvoiceTotalCents: verification.actualInvoiceTotalCents,
        invoiceStatus: verification.invoiceStatus,
        reason: options.reason,
        severity: "warning",
      },
      db,
    );

    return {
      syncResult: initialSyncResult,
      verification,
      retried: false,
      skippedImmutableInvoice: true,
    };
  }

  const retrySyncResult = await syncStripeDiscount(subscriptionId, input);
  const verifiedAfterRetry = await verifyStripeInvoiceAgainstDbState(
    subscriptionId,
    await retrieveStripeInvoice(stripe, latestInvoice),
    input,
  );

  if (verifiedAfterRetry && !verifiedAfterRetry.matches) {
    logStripeBillingEvent(
      BILLING_LOG_DISCOUNT_MISMATCH_DETECTED,
      {
        subscriptionId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        invoiceId: verifiedAfterRetry.invoiceId,
        invoiceStatus: verifiedAfterRetry.invoiceStatus,
        expectedEffectivePriceCents: verifiedAfterRetry.expectedEffectivePriceCents,
        actualInvoiceTotalCents: verifiedAfterRetry.actualInvoiceTotalCents,
        reason: options.reason,
        phase: "pre_billing_retry_failed",
      },
      "warn",
    );

    await createBillingDiscrepancyEvent(
      subscription,
      {
        eventType: BILLING_LOG_DISCOUNT_MISMATCH_DETECTED,
        billingStatus: BillingEventStatus.PENDING,
        invoiceId: verifiedAfterRetry.invoiceId,
        relatedStripeEventId: options.eventContext?.eventId ?? null,
        expectedEffectivePriceCents: verifiedAfterRetry.expectedEffectivePriceCents,
        actualInvoiceTotalCents: verifiedAfterRetry.actualInvoiceTotalCents,
        invoiceStatus: verifiedAfterRetry.invoiceStatus,
        reason: `${options.reason}: pre-billing verification mismatch after retry`,
        severity: "warning",
      },
      db,
    );
  }

  return {
    syncResult: retrySyncResult,
    verification: verifiedAfterRetry ?? verification,
    retried: true,
  };
}

async function handleStripeInvoiceSyncOpportunity(
  invoice: Stripe.Invoice,
  stage: "created" | "finalized",
  eventContext: StripeEventContext = {},
  input: StripeServiceDependencies = {},
) {
  const db = getDbClient(input);
  const auditLogger = getAuditLogger(input);
  const stripeSubscriptionId = extractInvoiceSubscriptionId(invoice);

  if (!stripeSubscriptionId) {
    return null;
  }

  const subscription = await getSubscriptionByStripeIdWithBusiness(
    stripeSubscriptionId,
    db,
  );

  if (!subscription) {
    return null;
  }

  if (
    isStaleStripeEvent({
      currentLastProcessedAt: subscription.lastStripeEventCreatedAt,
      incomingEventCreatedAt: eventContext.eventCreatedAt,
    })
  ) {
    logReferralDebug(`stripe.invoice_${stage}.stale_ignored`, {
      subscriptionId: subscription.id,
      stripeSubscriptionId,
      currentLastProcessedAt: subscription.lastStripeEventCreatedAt?.toISOString() ?? null,
      incomingEventCreatedAt: eventContext.eventCreatedAt?.toISOString() ?? null,
      invoiceId: invoice.id,
    });

    return {
      synced: false,
      stale: true,
      subscriptionId: subscription.id,
    };
  }

  if (eventContext.eventCreatedAt) {
    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        lastStripeEventCreatedAt: eventContext.eventCreatedAt,
      },
    });
  }

  if (stage === "finalized") {
    const verification = await verifyStripeInvoiceAgainstDbState(
      subscription.id,
      invoice,
      input,
    );

    logStripeBillingEvent(
      BILLING_LOG_INVOICE_ALREADY_FINALIZED_SKIP,
      {
        subscriptionId: subscription.id,
        stripeSubscriptionId,
        invoiceId: invoice.id,
        invoiceStatus: extractInvoiceStatus(invoice),
        expectedEffectivePriceCents:
          verification?.expectedEffectivePriceCents ?? subscription.effectivePriceCents,
        actualInvoiceTotalCents: verification?.actualInvoiceTotalCents ?? null,
        reason: "invoice.finalized",
      },
      "warn",
    );

    await createBillingDiscrepancyEvent(
      subscription,
      {
        eventType: BILLING_LOG_INVOICE_ALREADY_FINALIZED_SKIP,
        billingStatus: BillingEventStatus.PENDING,
        invoiceId: invoice.id,
        relatedStripeEventId: eventContext.eventId ?? null,
        expectedEffectivePriceCents:
          verification?.expectedEffectivePriceCents ?? subscription.effectivePriceCents,
        actualInvoiceTotalCents: verification?.actualInvoiceTotalCents ?? null,
        invoiceStatus: verification?.invoiceStatus ?? extractInvoiceStatus(invoice),
        reason: "invoice.finalized",
        severity: "warning",
        metadata: {
          stripeSubscriptionId,
          verification,
        },
      },
      db,
    );

    await auditLogger({
      businessId: subscription.businessId,
      actorCustomerId: subscription.customerId,
      action: `stripe.invoice.${stage}.skip_discount_sync`,
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: json({
        invoiceId: invoice.id,
        stripeSubscriptionId,
        logType: BILLING_LOG_INVOICE_ALREADY_FINALIZED_SKIP,
        verification,
      }),
    });

    return {
      synced: false,
      reason: BILLING_LOG_INVOICE_ALREADY_FINALIZED_SKIP,
      verification,
    };
  }

  const syncResult = await ensureDiscountSyncedBeforeBilling(
    subscription.id,
    {
      invoice,
      reason: `invoice.${stage}`,
      eventContext,
    },
    input,
  );

  await auditLogger({
    businessId: subscription.businessId,
    actorCustomerId: subscription.customerId,
    action: `stripe.invoice.${stage}.discount_sync`,
    targetType: "Subscription",
    targetId: subscription.id,
    metadata: json({
      invoiceId: invoice.id,
      stripeSubscriptionId,
      syncResult,
    }),
  });

  return syncResult;
}

export async function syncStripeDiscount(
  subscriptionId: string,
  input: StripeServiceDependencies = {},
): Promise<SyncStripeDiscountResult> {
  const db = getDbClient(input);
  const stripe = getStripeBillingClient(input);
  const auditLogger = getAuditLogger(input);
  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { business: true },
  });

  if (!subscription) {
    throw new Error("Subscription not found.");
  }

  const requestedDiscountPercent = Number(
    Math.max(decimalToNumber(subscription.currentDiscountPercent), 0).toFixed(2),
  );
  const appliedDiscountPercent = normalizeStripeDiscountPercent(
    requestedDiscountPercent,
  );

  if (!stripe || !subscription.stripeSubscriptionId) {
    return {
      synced: false,
      reason:
        "Stripe is not configured or the subscription has not been connected yet.",
      requestedDiscountPercent,
      appliedDiscountPercent,
      couponId: null,
      removedMyattDiscountIds: [],
      preservedDiscountIds: [],
    };
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
    { expand: ["discounts"] as never },
  );

  if (!canSyncStripeSubscription(stripeSubscription.status)) {
    return {
      synced: false,
      reason: `Stripe subscription is ${stripeSubscription.status}.`,
      stripeSubscriptionId: stripeSubscription.id,
      requestedDiscountPercent,
      appliedDiscountPercent,
      couponId: null,
      removedMyattDiscountIds: [],
      preservedDiscountIds: [],
    };
  }

  const { myattDiscounts, preservedDiscounts } = await partitionStripeDiscounts(
    stripe,
    stripeSubscription,
  );
  const couponId =
    appliedDiscountPercent > 0
      ? await ensureStripeCouponForDiscount(stripe, {
          businessId: subscription.businessId,
          subscriptionId: subscription.id,
          discountPercent: appliedDiscountPercent,
        })
      : null;
  const preservedDiscountIds = preservedDiscounts.map((discount) => discount.discountId);
  const currentPreservedIds = [...preservedDiscountIds].sort().join("|");
  const currentMyattCouponIds = myattDiscounts
    .map((discount) => discount.couponId ?? "")
    .sort();
  const targetMyattCouponIds = couponId ? [couponId] : [];
  const noChange =
    currentMyattCouponIds.length === targetMyattCouponIds.length &&
    currentMyattCouponIds.every((value, index) => value === targetMyattCouponIds[index]) &&
    currentPreservedIds === [...preservedDiscountIds].sort().join("|");

  if (noChange) {
    await auditLogger({
      businessId: subscription.businessId,
      actorCustomerId: subscription.customerId,
      action: "stripe.discount.sync",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: json({
        stripeSubscriptionId: stripeSubscription.id,
        requestedDiscountPercent,
        appliedDiscountPercent,
        couponId,
        noChange: true,
      }),
    });

    return {
      synced: true,
      noChange: true,
      stripeSubscriptionId: stripeSubscription.id,
      requestedDiscountPercent,
      appliedDiscountPercent,
      couponId,
      removedMyattDiscountIds: myattDiscounts.map((discount) => discount.discountId),
      preservedDiscountIds,
    };
  }

  const updatedStripeSubscription = await stripe.subscriptions.update(
    subscription.stripeSubscriptionId,
    {
      discounts: buildStripeDiscountUpdatePayload({
        preservedDiscountIds,
        couponId,
      }),
    },
  );

  await auditLogger({
    businessId: subscription.businessId,
    actorCustomerId: subscription.customerId,
    action: "stripe.discount.sync",
    targetType: "Subscription",
    targetId: subscription.id,
    metadata: json({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      requestedDiscountPercent,
      appliedDiscountPercent,
      couponId,
      removedMyattDiscountIds: myattDiscounts.map((discount) => discount.discountId),
      preservedDiscountIds,
      couponSource: MYATT_REFERRAL_COUPON_SOURCE,
    }),
  });

  logReferralDebug("stripe.discount.synced", {
    subscriptionId: subscription.id,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    requestedDiscountPercent,
    appliedDiscountPercent,
    couponId,
    removedMyattDiscountIds: myattDiscounts.map((discount) => discount.discountId),
    preservedDiscountIds,
  });

  return {
    synced: true,
    stripeSubscriptionId: updatedStripeSubscription.id,
    requestedDiscountPercent,
    appliedDiscountPercent,
    couponId,
    removedMyattDiscountIds: myattDiscounts.map((discount) => discount.discountId),
    preservedDiscountIds,
  };
}

export const syncDiscountToStripe = syncStripeDiscount;

export async function createStripeCheckoutSession(input: {
  businessId: string;
  businessSlug: string;
  businessName: string;
  planId: string;
  stripePriceId: string | null;
  customerEmail: string;
  customerId: string;
  referralCode?: string | null;
}) {
  const stripe = getStripeClient();

  if (!stripe || !input.stripePriceId || !isStripeConfigured()) {
    return {
      url: buildAbsoluteUrl(
        `/subscribe/${input.businessSlug}?mockCheckout=1&customerId=${input.customerId}`,
      ),
      mode: "mock" as const,
    };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: input.customerEmail,
    line_items: [{ price: input.stripePriceId, quantity: 1 }],
    success_url: buildAbsoluteUrl(`/subscribe/${input.businessSlug}?success=1`),
    cancel_url: buildAbsoluteUrl(`/subscribe/${input.businessSlug}?canceled=1`),
    metadata: {
      businessId: input.businessId,
      planId: input.planId,
      customerId: input.customerId,
      referralCode: input.referralCode ?? "",
      businessSlug: input.businessSlug,
      businessName: input.businessName,
    },
  });

  await prisma.billingEvent.create({
    data: {
      businessId: input.businessId,
      customerId: input.customerId,
      type: BillingEventType.CHECKOUT_CREATED,
      status: BillingEventStatus.SUCCEEDED,
      stripeCheckoutSessionId: session.id,
      metadata: json({ checkoutUrl: session.url }),
    },
  });

  return { url: session.url!, mode: "stripe" as const };
}

export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  const businessId = session.metadata?.businessId;
  const customerId = session.metadata?.customerId;
  const planId = session.metadata?.planId;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : null;

  if (!businessId || !customerId || !planId) {
    return null;
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: { stripeCustomerId },
  });

  await prisma.billingEvent.create({
    data: {
      businessId,
      customerId,
      type: BillingEventType.SUBSCRIPTION_CREATED,
      status: BillingEventStatus.SUCCEEDED,
      stripeCheckoutSessionId: session.id,
      metadata: json({ stripeSubscriptionId }),
    },
  });

  await createAuditLog({
    businessId,
    actorCustomerId: customerId,
    action: "checkout.completed",
    targetType: "CheckoutSession",
    targetId: session.id,
    metadata: json({ stripeCustomerId, stripeSubscriptionId }),
  });

  return { businessId, customerId, planId };
}

export async function handleStripeSubscriptionUpdated(
  stripeSubscription: Stripe.Subscription,
  reason:
    | "customer.subscription.created"
    | "customer.subscription.updated"
    | "customer.subscription.deleted" = "customer.subscription.updated",
  eventContext: StripeEventContext = {},
  input: StripeServiceDependencies = {},
) {
  const db = getDbClient(input);
  const subscriptionStatusHandler = getSubscriptionStatusHandler(input);
  const result = await upsertSubscriptionFromStripe(
    stripeSubscription,
    eventContext,
    input,
  );

  if (!result) {
    return null;
  }

  if (result.ignoredStale) {
    return result.subscription;
  }

  const subscription = result.subscription;

  await db.billingEvent.create({
    data: {
      businessId: subscription.businessId,
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      stripeEventId: eventContext.eventId ?? undefined,
      type:
        reason === "customer.subscription.deleted"
          ? BillingEventType.SUBSCRIPTION_CANCELED
          : BillingEventType.SUBSCRIPTION_UPDATED,
      status: BillingEventStatus.SUCCEEDED,
      metadata: json({
        stripeSubscriptionId: stripeSubscription.id,
        status: stripeSubscription.status,
        reason,
      }),
    },
  });

  const recalculationResult = await subscriptionStatusHandler(subscription.id, reason);
  for (const impactedSubscriptionId of collectSubscriptionIdsForSync(
    subscription.id,
    recalculationResult,
  )) {
    await ensureDiscountSyncedBeforeBilling(
      impactedSubscriptionId,
      {
        reason,
        eventContext,
      },
      input,
    );
  }

  return subscription;
}

export async function handleStripeInvoiceCreated(
  invoice: Stripe.Invoice,
  eventContext: StripeEventContext = {},
  input: StripeServiceDependencies = {},
) {
  return handleStripeInvoiceSyncOpportunity(
    invoice,
    "created",
    eventContext,
    input,
  );
}

export async function handleStripeInvoiceFinalized(
  invoice: Stripe.Invoice,
  eventContext: StripeEventContext = {},
  input: StripeServiceDependencies = {},
) {
  return handleStripeInvoiceSyncOpportunity(
    invoice,
    "finalized",
    eventContext,
    input,
  );
}

export async function handleStripeInvoicePaid(
  invoice: Stripe.Invoice,
  eventContext: StripeEventContext = {},
  input: StripeServiceDependencies = {},
) {
  const db = getDbClient(input);
  const auditLogger = getAuditLogger(input);
  const subscriptionStatusHandler = getSubscriptionStatusHandler(input);
  const stripeSubscriptionId = extractInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return null;

  const subscription = await getSubscriptionByStripeIdWithBusiness(
    stripeSubscriptionId,
    db,
  );
  if (!subscription) return null;

  if (
    isStaleStripeEvent({
      currentLastProcessedAt: subscription.lastStripeEventCreatedAt,
      incomingEventCreatedAt: eventContext.eventCreatedAt,
    })
  ) {
    logReferralDebug("stripe.invoice_paid.stale_ignored", {
      subscriptionId: subscription.id,
      stripeSubscriptionId,
      currentLastProcessedAt: subscription.lastStripeEventCreatedAt?.toISOString() ?? null,
      incomingEventCreatedAt: eventContext.eventCreatedAt?.toISOString() ?? null,
      invoiceId: invoice.id,
    });

    return subscription;
  }

  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      status: mapStripeSubscriptionStatus("active"),
      lastStripeEventCreatedAt:
        eventContext.eventCreatedAt ?? subscription.lastStripeEventCreatedAt,
    },
  });

  const billingEvent = await db.billingEvent.create({
    data: {
      businessId: subscription.businessId,
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      type: BillingEventType.INVOICE_PAID,
      status: BillingEventStatus.SUCCEEDED,
      stripeEventId: eventContext.eventId ?? undefined,
      stripeInvoiceId: invoice.id,
      amountCents: invoice.amount_paid,
      metadata: json({ hostedInvoiceUrl: invoice.hosted_invoice_url }),
    },
  });

  await db.platformFeeRecord.create({
    data: {
      businessId: subscription.businessId,
      subscriptionId: subscription.id,
      billingEventId: billingEvent.id,
      feeAmountCents: Math.round(invoice.amount_paid * 0.05),
      feePercent: 5,
      netAmountCents: invoice.amount_paid - Math.round(invoice.amount_paid * 0.05),
      status: PlatformFeeStatus.RECORDED,
    },
  });

  const recalculationResult = await subscriptionStatusHandler(
    subscription.id,
    "invoice.paid",
  );
  await syncSubscriptionIdsToStripe(
    collectSubscriptionIdsForSync(subscription.id, recalculationResult),
    input,
  );

  const verification = await verifyStripeInvoiceAgainstDbState(
    subscription.id,
    invoice,
    input,
  );

  if (verification && !verification.matches) {
    logStripeBillingEvent(
      BILLING_LOG_DISCOUNT_MISMATCH_DETECTED,
      {
        subscriptionId: subscription.id,
        stripeSubscriptionId,
        invoiceId: invoice.id,
        invoiceStatus: verification.invoiceStatus,
        expectedEffectivePriceCents: verification.expectedEffectivePriceCents,
        actualInvoiceTotalCents: verification.actualInvoiceTotalCents,
        reason: "invoice.paid",
      },
      "error",
    );

    await createBillingDiscrepancyEvent(
      subscription,
      {
        eventType: BILLING_LOG_DISCOUNT_MISMATCH_DETECTED,
        billingStatus: BillingEventStatus.FAILED,
        invoiceId: invoice.id,
        relatedStripeEventId: eventContext.eventId ?? null,
        expectedEffectivePriceCents: verification.expectedEffectivePriceCents,
        actualInvoiceTotalCents: verification.actualInvoiceTotalCents,
        invoiceStatus: verification.invoiceStatus,
        reason: "invoice.paid reconciliation mismatch",
        severity: "critical",
        metadata: {
          stripeSubscriptionId,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
        },
      },
      db,
    );

    await auditLogger({
      businessId: subscription.businessId,
      actorCustomerId: subscription.customerId,
      action: "stripe.invoice.paid.mismatch",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: json({
        logType: BILLING_LOG_DISCOUNT_MISMATCH_DETECTED,
        stripeSubscriptionId,
        invoiceId: invoice.id,
        verification,
      }),
    });
  }

  return billingEvent;
}

export async function handleStripeInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  eventContext: StripeEventContext = {},
  input: StripeServiceDependencies = {},
) {
  const db = getDbClient(input);
  const subscriptionStatusHandler = getSubscriptionStatusHandler(input);
  const stripeSubscriptionId = extractInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return null;

  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId },
  });
  if (!subscription) return null;

  if (
    isStaleStripeEvent({
      currentLastProcessedAt: subscription.lastStripeEventCreatedAt,
      incomingEventCreatedAt: eventContext.eventCreatedAt,
    })
  ) {
    logReferralDebug("stripe.invoice_failed.stale_ignored", {
      subscriptionId: subscription.id,
      stripeSubscriptionId,
      currentLastProcessedAt: subscription.lastStripeEventCreatedAt?.toISOString() ?? null,
      incomingEventCreatedAt: eventContext.eventCreatedAt?.toISOString() ?? null,
      invoiceId: invoice.id,
    });

    return subscription;
  }

  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      status: mapStripeSubscriptionStatus("past_due"),
      lastStripeEventCreatedAt:
        eventContext.eventCreatedAt ?? subscription.lastStripeEventCreatedAt,
    },
  });

  const billingEvent = await db.billingEvent.create({
    data: {
      businessId: subscription.businessId,
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      type: BillingEventType.INVOICE_PAYMENT_FAILED,
      status: BillingEventStatus.FAILED,
      stripeEventId: eventContext.eventId ?? undefined,
      stripeInvoiceId: invoice.id,
      amountCents: invoice.amount_due,
    },
  });

  const recalculationResult = await subscriptionStatusHandler(
    subscription.id,
    "invoice.payment_failed",
  );
  await syncSubscriptionIdsToStripe(
    collectSubscriptionIdsForSync(subscription.id, recalculationResult),
    input,
  );

  return billingEvent;
}
