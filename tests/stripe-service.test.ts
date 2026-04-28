import assert from "node:assert/strict";
import test from "node:test";

import {
  BillingEventStatus,
  BillingEventType,
  Prisma,
  SubscriptionStatus,
  WebhookEventStatus,
} from "@prisma/client";

import {
  handleStripeInvoiceCreated,
  handleStripeInvoiceFinalized,
  handleStripeInvoicePaid,
  handleStripeSubscriptionUpdated,
  syncStripeDiscount,
} from "../src/lib/stripe-service";
import { processStripeWebhookEvent } from "../src/lib/stripe-webhook-service";

type CouponRecord = {
  id: string;
  object: "coupon";
  duration: "forever";
  name: string;
  percent_off: number;
  metadata: Record<string, string>;
};

type DiscountRecord = {
  id: string;
  object: "discount";
  coupon: CouponRecord;
};

type InvoiceRecord = {
  id: string;
  object: "invoice";
  subscription: string;
  status: string;
  total: number;
  amount_due: number;
  amount_paid: number;
  hosted_invoice_url: string;
};

type RemoteDiscountSeed = {
  type: "myatt" | "manual";
  percent: number;
};

type FixtureOptions = {
  localDiscountPercent?: number;
  localStatus?: SubscriptionStatus;
  lastStripeEventCreatedAt?: Date | null;
  remoteDiscounts?: RemoteDiscountSeed[];
  remoteStripeStatus?: string;
  invoiceStatus?: string;
  invoiceTotalCents?: number | null;
  autoRecalculateDraftInvoice?: boolean;
  invoiceRefreshLagRetrieves?: number;
};

type SubscriptionFindUniqueArgs = {
  where: {
    id?: string;
    stripeSubscriptionId?: string;
  };
  include?: {
    business?: boolean;
  };
};

type SubscriptionUpdateArgs = {
  data: Record<string, unknown>;
};

type RecordCreateArgs = {
  data: Record<string, unknown>;
};

type WebhookFindArgs = {
  where: {
    eventId: string;
  };
  select?: {
    status?: boolean;
  };
};

type WebhookUpsertArgs = {
  where: {
    eventId: string;
  };
  update: {
    status: WebhookEventStatus;
    payload?: unknown;
  };
  create: {
    eventId: string;
    type?: string;
    status: WebhookEventStatus;
    payload?: unknown;
  };
};

type WebhookUpdateManyArgs = {
  where: {
    eventId: string;
  };
  data: {
    status: WebhookEventStatus;
    processedAt?: Date;
    errorMessage?: string;
  };
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createCoupon(input: {
  id: string;
  name: string;
  percentOff: number;
  metadata?: Record<string, string>;
}): CouponRecord {
  return {
    id: input.id,
    object: "coupon",
    duration: "forever",
    name: input.name,
    percent_off: input.percentOff,
    metadata: input.metadata ?? {},
  };
}

function createDiscount(input: { id: string; coupon: CouponRecord }): DiscountRecord {
  return {
    id: input.id,
    object: "discount",
    coupon: input.coupon,
  };
}

function calculateEffectivePrice(basePriceCents: number, discountPercent: number) {
  const normalized = Math.max(0, Math.min(discountPercent, 100));
  return Math.round(basePriceCents * (1 - normalized / 100));
}

function createStripeSyncFixture(options: FixtureOptions = {}) {
  const webhookEvents = new Map<string, { status: WebhookEventStatus; payload?: unknown }>();
  const billingEvents: Array<Record<string, unknown>> = [];
  const platformFeeRecords: Array<Record<string, unknown>> = [];
  const businessId = "business_sync_1";
  const subscriptionId = "subscription_sync_1";
  const stripeSubscriptionId = "stripe_subscription_sync_1";
  const stripeCustomerId = "stripe_customer_sync_1";
  const basePriceCents = 25_000;
  const localDiscountPercent = options.localDiscountPercent ?? 0;
  const autoRecalculateDraftInvoice = options.autoRecalculateDraftInvoice ?? true;
  let pendingInvoiceRefreshLag = options.invoiceRefreshLagRetrieves ?? 0;
  let couponSequence = 0;
  let discountSequence = 0;
  let billingEventSequence = 0;
  let platformFeeSequence = 0;
  let subscriptionUpdateCalls = 0;
  let subscriptionRetrieveCalls = 0;
  let subscriptionStatusHandlerCalls = 0;
  let localSubscriptionUpdateCalls = 0;
  let invoiceRetrieveCalls = 0;

  const business = {
    id: businessId,
    name: "Stripe Safe Co",
    slug: "stripe-safe-co",
  };

  const subscription = {
    id: subscriptionId,
    businessId,
    customerId: "customer_sync_1",
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId: "price_sync_1",
    currentDiscountPercent: new Prisma.Decimal(localDiscountPercent),
    effectivePriceCents: calculateEffectivePrice(basePriceCents, localDiscountPercent),
    basePriceCents,
    status: options.localStatus ?? SubscriptionStatus.ACTIVE,
    lastStripeEventCreatedAt: options.lastStripeEventCreatedAt ?? null,
  };

  const coupons = new Map<string, CouponRecord>();
  const remoteDiscounts: DiscountRecord[] = [];

  for (const discount of options.remoteDiscounts ?? []) {
    couponSequence += 1;
    const coupon = createCoupon({
      id: `coupon_${couponSequence}`,
      name:
        discount.type === "myatt"
          ? `MYATT_REFERRAL_${discount.percent}_PERCENT`
          : `MANUAL_BUSINESS_${discount.percent}_PERCENT`,
      percentOff: discount.percent,
      metadata:
        discount.type === "myatt"
          ? {
              source: "myatt_referral_method",
              businessId,
              subscriptionId,
            }
          : {
              source: "manual_business_discount",
            },
    });
    coupons.set(coupon.id, coupon);
    discountSequence += 1;
    remoteDiscounts.push(
      createDiscount({
        id: `discount_${discountSequence}`,
        coupon,
      }),
    );
  }

  const remoteSubscription = {
    id: stripeSubscriptionId,
    object: "subscription",
    status: options.remoteStripeStatus ?? "active",
    customer: stripeCustomerId,
    items: {
      data: [
        {
          price: {
            id: "price_sync_1",
            unit_amount: basePriceCents,
          },
        },
      ],
    },
    discounts: {
      data: remoteDiscounts,
    },
  };

  function currentRemoteMyattDiscountPercent() {
    return (
      remoteSubscription.discounts.data.find(
        (discount) => discount.coupon.metadata.source === "myatt_referral_method",
      )?.coupon.percent_off ?? 0
    );
  }

  function currentInvoiceTotalFromSubscription() {
    return calculateEffectivePrice(basePriceCents, currentRemoteMyattDiscountPercent());
  }

  const remoteInvoice: InvoiceRecord = {
    id: "in_sync_1",
    object: "invoice",
    subscription: stripeSubscriptionId,
    status: options.invoiceStatus ?? "draft",
    total:
      options.invoiceTotalCents ?? currentInvoiceTotalFromSubscription(),
    amount_due:
      options.invoiceTotalCents ?? currentInvoiceTotalFromSubscription(),
    amount_paid:
      options.invoiceStatus === "paid"
        ? options.invoiceTotalCents ?? currentInvoiceTotalFromSubscription()
        : 0,
    hosted_invoice_url: "https://stripe.test/in_sync_1",
  };

  function refreshDraftInvoiceTotal() {
    if (remoteInvoice.status !== "draft" || !autoRecalculateDraftInvoice) {
      return;
    }

    remoteInvoice.total = currentInvoiceTotalFromSubscription();
    remoteInvoice.amount_due = remoteInvoice.total;
  }

  const stripeClient = {
    coupons: {
      async list() {
        return { data: [...coupons.values()].map((coupon) => clone(coupon)) };
      },
      async create(input: {
        name: string;
        percent_off: number;
        metadata: Record<string, string>;
      }) {
        couponSequence += 1;
        const coupon = createCoupon({
          id: `coupon_${couponSequence}`,
          name: input.name,
          percentOff: input.percent_off,
          metadata: input.metadata,
        });
        coupons.set(coupon.id, coupon);
        return clone(coupon);
      },
      async retrieve(couponId: string) {
        const coupon = coupons.get(couponId);
        if (!coupon) {
          throw new Error(`Coupon ${couponId} not found.`);
        }
        return clone(coupon);
      },
    },
    subscriptions: {
      async retrieve() {
        subscriptionRetrieveCalls += 1;
        return clone(remoteSubscription);
      },
      async update(id: string, input: { discounts?: Array<{ discount?: string; coupon?: string }> }) {
        subscriptionUpdateCalls += 1;
        const nextDiscounts: DiscountRecord[] = [];

        for (const descriptor of input.discounts ?? []) {
          if (descriptor.discount) {
            const existing = remoteSubscription.discounts.data.find(
              (discount) => discount.id === descriptor.discount,
            );
            if (existing) {
              nextDiscounts.push(existing);
            }
            continue;
          }

          if (descriptor.coupon) {
            const coupon = coupons.get(descriptor.coupon);
            if (!coupon) {
              throw new Error(`Coupon ${descriptor.coupon} not found.`);
            }
            discountSequence += 1;
            nextDiscounts.push(
              createDiscount({
                id: `discount_${discountSequence}`,
                coupon,
              }),
            );
          }
        }

        remoteSubscription.discounts.data = nextDiscounts;
        if (remoteInvoice.status === "draft" && autoRecalculateDraftInvoice && pendingInvoiceRefreshLag <= 0) {
          refreshDraftInvoiceTotal();
        }
        return clone({ ...remoteSubscription, id });
      },
    },
    invoices: {
      async retrieve(invoiceId: string) {
        invoiceRetrieveCalls += 1;
        if (invoiceId !== remoteInvoice.id) {
          throw new Error(`Invoice ${invoiceId} not found.`);
        }

        if (remoteInvoice.status === "draft" && autoRecalculateDraftInvoice) {
          if (pendingInvoiceRefreshLag > 0) {
            pendingInvoiceRefreshLag -= 1;
          } else {
            refreshDraftInvoiceTotal();
          }
        }

        return clone(remoteInvoice);
      },
    },
  };

  const db = {
    subscription: {
      async findUnique(args: SubscriptionFindUniqueArgs) {
        if (args.where.id && args.where.id !== subscription.id) {
          return null;
        }
        if (
          args.where.stripeSubscriptionId &&
          args.where.stripeSubscriptionId !== subscription.stripeSubscriptionId
        ) {
          return null;
        }

        return {
          ...subscription,
          ...(args.include?.business ? { business: clone(business) } : {}),
        };
      },
      async update(args: SubscriptionUpdateArgs) {
        localSubscriptionUpdateCalls += 1;
        Object.assign(subscription, args.data);
        return {
          ...subscription,
        };
      },
      async findFirst() {
        return {
          ...subscription,
        };
      },
    },
    customer: {
      async findUnique() {
        return {
          id: subscription.customerId,
        };
      },
    },
    billingEvent: {
      async create(args: RecordCreateArgs) {
        billingEventSequence += 1;
        const record = { id: `billing_event_${billingEventSequence}`, ...args.data };
        billingEvents.push(record);
        return record;
      },
    },
    platformFeeRecord: {
      async create(args: RecordCreateArgs) {
        platformFeeSequence += 1;
        const record = { id: `platform_fee_${platformFeeSequence}`, ...args.data };
        platformFeeRecords.push(record);
        return record;
      },
    },
    webhookEvent: {
      async findUnique(args: WebhookFindArgs) {
        const event = webhookEvents.get(args.where.eventId);
        return event ? { status: event.status } : null;
      },
      async upsert(args: WebhookUpsertArgs) {
        const existing = webhookEvents.get(args.where.eventId);
        const next = existing
          ? { ...existing, ...args.update }
          : {
              eventId: args.create.eventId,
              status: args.create.status,
              payload: args.create.payload,
            };
        webhookEvents.set(args.where.eventId, next);
        return next;
      },
      async updateMany(args: WebhookUpdateManyArgs) {
        const existing = webhookEvents.get(args.where.eventId);
        if (!existing) {
          return { count: 0 };
        }
        webhookEvents.set(args.where.eventId, { ...existing, ...args.data });
        return { count: 1 };
      },
    },
  };

  const deps = {
    db,
    stripeClient,
    auditLogger: async () => null,
    subscriptionStatusChangeHandler: async () => {
      subscriptionStatusHandlerCalls += 1;
      return { subscriptionId: subscription.id, impactedCustomerIds: [], results: [] };
    },
  };

  return {
    db,
    deps,
    state: {
      business,
      subscription,
      coupons,
      remoteInvoice,
      remoteSubscription,
      webhookEvents,
      billingEvents,
      platformFeeRecords,
    },
    helpers: {
      setLocalDiscountPercent(nextPercent: number) {
        subscription.currentDiscountPercent = new Prisma.Decimal(nextPercent);
        subscription.effectivePriceCents = calculateEffectivePrice(basePriceCents, nextPercent);
      },
      setInvoiceStatus(nextStatus: string) {
        remoteInvoice.status = nextStatus;
      },
      setInvoiceTotal(nextTotal: number) {
        remoteInvoice.total = nextTotal;
        remoteInvoice.amount_due = nextTotal;
      },
      markInvoicePaid() {
        remoteInvoice.status = "paid";
        remoteInvoice.amount_paid = remoteInvoice.total;
      },
    },
    metrics: {
      get subscriptionUpdateCalls() {
        return subscriptionUpdateCalls;
      },
      get subscriptionRetrieveCalls() {
        return subscriptionRetrieveCalls;
      },
      get subscriptionStatusHandlerCalls() {
        return subscriptionStatusHandlerCalls;
      },
      get localSubscriptionUpdateCalls() {
        return localSubscriptionUpdateCalls;
      },
      get invoiceRetrieveCalls() {
        return invoiceRetrieveCalls;
      },
    },
  };
}

test("0% discount removes only the Myatt referral discount", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 0,
    remoteDiscounts: [{ type: "myatt", percent: 5 }],
  });

  const result = await syncStripeDiscount(
    fixture.state.subscription.id,
    fixture.deps as never,
  );

  assert.equal(result.synced, true);
  assert.equal(result.couponId, null);
  assert.equal(fixture.state.remoteSubscription.discounts.data.length, 0);
  assert.equal(fixture.metrics.subscriptionUpdateCalls, 1);
});

test("5% discount applies the correct Myatt coupon", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 5,
  });

  const result = await syncStripeDiscount(
    fixture.state.subscription.id,
    fixture.deps as never,
  );
  const appliedDiscount = fixture.state.remoteSubscription.discounts.data[0];

  assert.equal(result.synced, true);
  assert.equal(appliedDiscount.coupon.name, "MYATT_REFERRAL_5_PERCENT");
  assert.equal(appliedDiscount.coupon.percent_off, 5);
  assert.equal(appliedDiscount.coupon.metadata.source, "myatt_referral_method");
  assert.equal(appliedDiscount.coupon.metadata.businessId, fixture.state.business.id);
  assert.equal(
    appliedDiscount.coupon.metadata.subscriptionId,
    fixture.state.subscription.id,
  );
});

test("10% discount replaces an older 5% Myatt coupon", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 10,
    remoteDiscounts: [{ type: "myatt", percent: 5 }],
  });

  await syncStripeDiscount(fixture.state.subscription.id, fixture.deps as never);

  assert.equal(fixture.state.remoteSubscription.discounts.data.length, 1);
  assert.equal(
    fixture.state.remoteSubscription.discounts.data[0].coupon.name,
    "MYATT_REFERRAL_10_PERCENT",
  );
});

test("unrelated Stripe discounts are preserved when Myatt discount changes", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 10,
    remoteDiscounts: [
      { type: "manual", percent: 15 },
      { type: "myatt", percent: 5 },
    ],
  });

  await syncStripeDiscount(fixture.state.subscription.id, fixture.deps as never);

  const couponNames = fixture.state.remoteSubscription.discounts.data
    .map((discount) => discount.coupon.name)
    .sort();

  assert.deepEqual(couponNames, [
    "MANUAL_BUSINESS_15_PERCENT",
    "MYATT_REFERRAL_10_PERCENT",
  ]);
});

test("duplicate webhook processing does not duplicate Myatt coupons", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 5,
  });

  const handlers = {
    async handleCheckoutSessionCompleted() {
      throw new Error("Unexpected checkout event.");
    },
    async handleStripeSubscriptionUpdated() {
      throw new Error("Unexpected subscription event.");
    },
    async handleStripeInvoiceCreated() {
      return syncStripeDiscount(fixture.state.subscription.id, fixture.deps as never);
    },
    async handleStripeInvoiceFinalized() {
      throw new Error("Unexpected invoice.finalized event.");
    },
    async handleStripeInvoicePaid() {
      throw new Error("Unexpected invoice.paid event.");
    },
    async handleStripeInvoicePaymentFailed() {
      throw new Error("Unexpected invoice.payment_failed event.");
    },
  };

  const event = {
    id: "evt_invoice_created_duplicate",
    type: "invoice.created",
    created: 1777777777,
    data: {
      object: {
        id: "in_123",
        subscription: fixture.state.subscription.stripeSubscriptionId,
      },
    },
  };

  await processStripeWebhookEvent(event, {
    db: fixture.db as never,
    handlers,
  });
  await processStripeWebhookEvent(event, {
    db: fixture.db as never,
    handlers,
  });

  assert.equal(fixture.metrics.subscriptionUpdateCalls, 1);
  assert.equal(fixture.state.remoteSubscription.discounts.data.length, 1);
  assert.equal(
    fixture.state.remoteSubscription.discounts.data[0].coupon.name,
    "MYATT_REFERRAL_5_PERCENT",
  );
  assert.equal(
    fixture.state.webhookEvents.get(event.id)?.status,
    WebhookEventStatus.PROCESSED,
  );
});

test("stale Stripe events do not overwrite the current discount state", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 10,
    remoteDiscounts: [{ type: "myatt", percent: 10 }],
    lastStripeEventCreatedAt: new Date("2026-04-26T12:00:00.000Z"),
  });

  await handleStripeSubscriptionUpdated(
    {
      id: fixture.state.subscription.stripeSubscriptionId,
      object: "subscription",
      status: "past_due",
      customer: fixture.state.subscription.stripeCustomerId,
      items: {
        data: [
          {
            price: {
              id: fixture.state.subscription.stripePriceId,
              unit_amount: fixture.state.subscription.basePriceCents,
            },
          },
        ],
      },
    } as never,
    "customer.subscription.updated",
    {
      eventId: "evt_stale_subscription",
      eventCreatedAt: new Date("2026-04-26T11:00:00.000Z"),
    },
    fixture.deps as never,
  );

  assert.equal(fixture.state.subscription.status, SubscriptionStatus.ACTIVE);
  assert.equal(
    fixture.state.subscription.currentDiscountPercent.toNumber(),
    10,
  );
  assert.equal(fixture.metrics.localSubscriptionUpdateCalls, 0);
  assert.equal(fixture.metrics.subscriptionUpdateCalls, 0);
  assert.equal(fixture.metrics.subscriptionStatusHandlerCalls, 0);
  assert.equal(
    fixture.state.remoteSubscription.discounts.data[0].coupon.name,
    "MYATT_REFERRAL_10_PERCENT",
  );
});

test("repeating the same sync does not add duplicate Myatt discounts", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 5,
  });

  await syncStripeDiscount(fixture.state.subscription.id, fixture.deps as never);
  await syncStripeDiscount(fixture.state.subscription.id, fixture.deps as never);

  assert.equal(fixture.state.remoteSubscription.discounts.data.length, 1);
  assert.equal(fixture.metrics.subscriptionUpdateCalls, 1);
});

test("discount applied before invoice results in the correct draft total", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 5,
    invoiceStatus: "draft",
    invoiceTotalCents: 25_000,
  });

  await handleStripeInvoiceCreated(
    fixture.state.remoteInvoice as never,
    {
      eventId: "evt_invoice_created_apply",
      eventCreatedAt: new Date("2026-04-27T10:00:00.000Z"),
    },
    fixture.deps as never,
  );

  assert.equal(
    fixture.state.remoteSubscription.discounts.data[0]?.coupon.name,
    "MYATT_REFERRAL_5_PERCENT",
  );
  assert.equal(fixture.state.remoteInvoice.total, 23_750);
  assert.equal(fixture.metrics.invoiceRetrieveCalls, 1);
  assert.equal(
    fixture.state.billingEvents.filter(
      (event) => event.type === BillingEventType.MANUAL_ADJUSTMENT,
    ).length,
    0,
  );
});

test("discount updated right before billing produces the latest invoice total", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 10,
    remoteDiscounts: [{ type: "myatt", percent: 5 }],
    invoiceStatus: "draft",
    invoiceTotalCents: 23_750,
    invoiceRefreshLagRetrieves: 1,
  });

  await handleStripeInvoiceCreated(
    fixture.state.remoteInvoice as never,
    {
      eventId: "evt_invoice_created_retry",
      eventCreatedAt: new Date("2026-04-27T10:05:00.000Z"),
    },
    fixture.deps as never,
  );

  assert.equal(
    fixture.state.remoteSubscription.discounts.data[0]?.coupon.name,
    "MYATT_REFERRAL_10_PERCENT",
  );
  assert.equal(fixture.state.remoteInvoice.total, 22_500);
  assert.equal(fixture.metrics.invoiceRetrieveCalls, 2);
  assert.equal(fixture.metrics.subscriptionUpdateCalls, 1);
  assert.equal(
    fixture.state.billingEvents.filter(
      (event) => event.type === BillingEventType.MANUAL_ADJUSTMENT,
    ).length,
    0,
  );
});

test("invoice.finalized mismatch is flagged without mutating finalized billing", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 10,
    remoteDiscounts: [{ type: "myatt", percent: 5 }],
    invoiceStatus: "open",
    invoiceTotalCents: 23_750,
  });

  await handleStripeInvoiceFinalized(
    fixture.state.remoteInvoice as never,
    {
      eventId: "evt_invoice_finalized_skip",
      eventCreatedAt: new Date("2026-04-27T10:10:00.000Z"),
    },
    fixture.deps as never,
  );

  assert.equal(fixture.metrics.subscriptionUpdateCalls, 0);
  assert.equal(
    fixture.state.remoteSubscription.discounts.data[0]?.coupon.name,
    "MYATT_REFERRAL_5_PERCENT",
  );

  const manualEvent = fixture.state.billingEvents.find(
    (event) =>
      event.type === BillingEventType.MANUAL_ADJUSTMENT &&
      event.status === BillingEventStatus.PENDING,
  );

  assert.ok(manualEvent);
  assert.equal(
    (manualEvent.metadata as { logType?: string }).logType,
    "INVOICE_ALREADY_FINALIZED_SKIP",
  );
});

test("multiple rapid referral changes before billing end with the final discount", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 5,
    remoteDiscounts: [{ type: "myatt", percent: 5 }],
    invoiceStatus: "draft",
    invoiceTotalCents: 23_750,
  });

  fixture.helpers.setLocalDiscountPercent(10);
  await handleStripeSubscriptionUpdated(
    {
      id: fixture.state.subscription.stripeSubscriptionId,
      object: "subscription",
      status: "active",
      customer: fixture.state.subscription.stripeCustomerId,
      items: {
        data: [
          {
            price: {
              id: fixture.state.subscription.stripePriceId,
              unit_amount: fixture.state.subscription.basePriceCents,
            },
          },
        ],
      },
    } as never,
    "customer.subscription.updated",
    {
      eventId: "evt_subscription_10",
      eventCreatedAt: new Date("2026-04-27T10:15:00.000Z"),
    },
    fixture.deps as never,
  );

  fixture.helpers.setLocalDiscountPercent(15);
  await handleStripeSubscriptionUpdated(
    {
      id: fixture.state.subscription.stripeSubscriptionId,
      object: "subscription",
      status: "active",
      customer: fixture.state.subscription.stripeCustomerId,
      items: {
        data: [
          {
            price: {
              id: fixture.state.subscription.stripePriceId,
              unit_amount: fixture.state.subscription.basePriceCents,
            },
          },
        ],
      },
    } as never,
    "customer.subscription.updated",
    {
      eventId: "evt_subscription_15",
      eventCreatedAt: new Date("2026-04-27T10:16:00.000Z"),
    },
    fixture.deps as never,
  );

  await handleStripeInvoiceCreated(
    fixture.state.remoteInvoice as never,
    {
      eventId: "evt_invoice_created_final_discount",
      eventCreatedAt: new Date("2026-04-27T10:17:00.000Z"),
    },
    fixture.deps as never,
  );

  assert.equal(
    fixture.state.remoteSubscription.discounts.data[0]?.coupon.name,
    "MYATT_REFERRAL_15_PERCENT",
  );
  assert.equal(fixture.state.remoteInvoice.total, 21_250);
});

test("webhook delay scenario is flagged during paid-invoice reconciliation", async () => {
  const fixture = createStripeSyncFixture({
    localDiscountPercent: 10,
    remoteDiscounts: [{ type: "myatt", percent: 5 }],
    invoiceStatus: "open",
    invoiceTotalCents: 23_750,
    lastStripeEventCreatedAt: new Date("2026-04-27T12:00:00.000Z"),
  });

  await handleStripeInvoiceCreated(
    fixture.state.remoteInvoice as never,
    {
      eventId: "evt_invoice_created_delayed",
      eventCreatedAt: new Date("2026-04-27T11:00:00.000Z"),
    },
    fixture.deps as never,
  );

  fixture.helpers.markInvoicePaid();
  await handleStripeInvoicePaid(
    fixture.state.remoteInvoice as never,
    {
      eventId: "evt_invoice_paid_delayed",
      eventCreatedAt: new Date("2026-04-27T13:00:00.000Z"),
    },
    fixture.deps as never,
  );

  const mismatchEvent = fixture.state.billingEvents.find(
    (event) =>
      event.type === BillingEventType.MANUAL_ADJUSTMENT &&
      event.status === BillingEventStatus.FAILED,
  );

  assert.ok(mismatchEvent);
  assert.equal(
    (mismatchEvent.metadata as { logType?: string }).logType,
    "DISCOUNT_MISMATCH_DETECTED",
  );
  assert.equal(mismatchEvent.effectivePriceCents, 22_500);
  assert.equal(mismatchEvent.amountCents, 23_750);
});
