import {
  BillingEventStatus,
  BillingEventType,
  Prisma,
  ReferralStatus,
  SubscriptionStatus,
} from "@prisma/client";

import {
  ACTIVE_REFERRAL_SUBSCRIPTION_STATUSES,
  DEFAULT_REFERRAL_PERCENT,
} from "@/lib/constants";
import { isReferralDebugEnabled, logReferralDebug } from "@/lib/referral-debug";
import { decimalToNumber } from "@/lib/money";
import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type RecalculationReason =
  | "manual"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "checkout.mock_activation";

export type RecalculationOptions = {
  reason?: RecalculationReason | string;
};

export type ReferralDiscountBreakdown = {
  customerId: string;
  subscriptionId: string | null;
  basePriceCents: number;
  referralPercent: number;
  activeReferralCount: number;
  totalDiscountPercent: number;
  discountAmountCents: number;
  effectivePriceCents: number;
};

type ApplicableReferralSettings = {
  referralProgramEnabled: boolean;
  referralPercent: number;
  maxDiscountPercent: number | null;
  minPriceCents: number | null;
};

type BusinessDiscountRiskSummary = {
  businessId: string;
  totalDiscountPercentIssued: number;
  averageDiscountPerUser: number;
  highestDiscountUser:
    | {
        customerId: string;
        subscriptionId: string;
        discountPercent: number;
      }
    | null;
  revenueDiscountedPercent: number;
};

type PlanReferralSettingsRecord = {
  priceCents: number;
  minPriceCents: number | null;
  referralPercentOverride: Prisma.Decimal | null;
  maxDiscountPercent: Prisma.Decimal | null;
};

function firstDefinedNumber(
  ...values: Array<number | null | undefined>
) {
  return values.find((value) => value !== null && value !== undefined);
}

async function resolveActiveSubscription(customerId: string, db: DbClient) {
  return db.subscription.findFirst({
    where: {
      customerId,
      status: SubscriptionStatus.ACTIVE,
      deletedAt: null,
    },
    include: {
      plan: true,
      business: true,
      customer: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

async function resolveApplicableReferralRule(
  businessId: string,
  planId: string,
  db: DbClient,
) : Promise<ApplicableReferralSettings> {
  const [planRule, businessRule, business, plan] = await Promise.all([
    db.referralDiscountRule.findFirst({
      where: {
        businessId,
        planId,
        isActive: true,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { effectiveFrom: "desc" },
    }),
    db.referralDiscountRule.findFirst({
      where: {
        businessId,
        planId: null,
        isActive: true,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { effectiveFrom: "desc" },
    }),
    db.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        referralProgramEnabled: true,
        defaultReferralPercent: true,
        maxReferralDiscountPercent: true,
      },
    }),
    db.subscriptionPlan.findUniqueOrThrow({
      where: { id: planId },
      select: {
        priceCents: true,
        minPriceCents: true,
        referralPercentOverride: true,
        maxDiscountPercent: true,
      } as never,
    }) as unknown as Promise<PlanReferralSettingsRecord>,
  ]);

  const referralPercent =
    firstDefinedNumber(
      planRule?.referralPercent ? decimalToNumber(planRule.referralPercent) : undefined,
      plan.referralPercentOverride
        ? decimalToNumber(plan.referralPercentOverride)
        : undefined,
      businessRule?.referralPercent
        ? decimalToNumber(businessRule.referralPercent)
        : undefined,
      decimalToNumber(business.defaultReferralPercent),
    ) ?? DEFAULT_REFERRAL_PERCENT;
  const maxDiscountPercent =
    firstDefinedNumber(
      planRule?.maxDiscountPercent
        ? decimalToNumber(planRule.maxDiscountPercent)
        : undefined,
      plan.maxDiscountPercent ? decimalToNumber(plan.maxDiscountPercent) : undefined,
      businessRule?.maxDiscountPercent
        ? decimalToNumber(businessRule.maxDiscountPercent)
        : undefined,
      business.maxReferralDiscountPercent
        ? decimalToNumber(business.maxReferralDiscountPercent)
        : undefined,
    ) ?? null;
  const minPriceCents = plan.minPriceCents ?? null;

  validateReferralProgramConfiguration({
    referralPercent,
    maxDiscountPercent,
    basePriceCents: plan.priceCents,
    minPriceCents,
  });

  return {
    referralProgramEnabled: business.referralProgramEnabled,
    referralPercent,
    maxDiscountPercent,
    minPriceCents,
  };
}

async function loadReferralEvaluationSnapshot(
  customerId: string,
  businessId: string,
  db: DbClient,
) {
  return db.referral.findMany({
    where: {
      businessId,
      referrerCustomerId: customerId,
    },
    select: {
      id: true,
      status: true,
      referredCustomerId: true,
      referredSubscription: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

function isEligibleForActiveReferral(status: SubscriptionStatus) {
  return ACTIVE_REFERRAL_SUBSCRIPTION_STATUSES.includes(status);
}

function calculateStoredDiscountPercent(
  activeReferralCount: number,
  referralPercent: number,
  maxDiscountPercent: number | null,
) {
  const totalDiscountPercent = Math.max(activeReferralCount * referralPercent, 0);

  if (maxDiscountPercent === null) {
    return totalDiscountPercent;
  }

  return Math.min(totalDiscountPercent, maxDiscountPercent);
}

function calculateAppliedDiscountAmountCents(
  basePriceCents: number,
  totalDiscountPercent: number,
  minPriceCents: number | null,
) {
  const requestedDiscountCents = Math.round(
    basePriceCents * (Math.max(totalDiscountPercent, 0) / 100),
  );
  const maxDiscountCentsFromFloor =
    minPriceCents === null
      ? basePriceCents
      : Math.max(basePriceCents - minPriceCents, 0);

  return Math.min(requestedDiscountCents, basePriceCents, maxDiscountCentsFromFloor);
}

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

function calculateAppliedDiscountPercent(
  basePriceCents: number,
  discountAmountCents: number,
) {
  if (basePriceCents <= 0) {
    return 0;
  }

  return roundPercent((discountAmountCents / basePriceCents) * 100);
}

function buildNoActiveSubscriptionBreakdown(
  customerId: string,
): ReferralDiscountBreakdown {
  return {
    customerId,
    subscriptionId: null,
    basePriceCents: 0,
    referralPercent: 0,
    activeReferralCount: 0,
    totalDiscountPercent: 0,
    discountAmountCents: 0,
    effectivePriceCents: 0,
  };
}

function resolveNextReferralStatus(input: {
  currentStatus: ReferralStatus;
  referredSubscriptionStatus: SubscriptionStatus;
  activatedAt: Date | null;
}) {
  if (isEligibleForActiveReferral(input.referredSubscriptionStatus)) {
    return ReferralStatus.ACTIVE;
  }

  if (input.currentStatus === ReferralStatus.ACTIVE || input.activatedAt) {
    return ReferralStatus.INACTIVE;
  }

  return ReferralStatus.PENDING;
}

export function validateReferralProgramConfiguration(input: {
  referralPercent: number;
  maxDiscountPercent?: number | null;
  basePriceCents?: number | null;
  minPriceCents?: number | null;
}) {
  if (input.referralPercent < 0 || input.referralPercent > 100) {
    throw new Error("Referral percent must be between 0 and 100.");
  }

  if (
    input.maxDiscountPercent !== null &&
    input.maxDiscountPercent !== undefined &&
    (input.maxDiscountPercent < 0 || input.maxDiscountPercent > 100)
  ) {
    throw new Error("Max discount percent must be between 0 and 100.");
  }

  if (
    input.basePriceCents !== null &&
    input.basePriceCents !== undefined &&
    input.minPriceCents !== null &&
    input.minPriceCents !== undefined &&
    input.minPriceCents > input.basePriceCents
  ) {
    throw new Error("Minimum price cents cannot exceed the plan base price.");
  }
}

export async function getBusinessReferralDiscountAnalytics(
  businessId: string,
  db: DbClient = prisma,
): Promise<BusinessDiscountRiskSummary> {
  const subscriptions = await db.subscription.findMany({
    where: {
      businessId,
      status: SubscriptionStatus.ACTIVE,
      deletedAt: null,
    },
    select: {
      id: true,
      customerId: true,
      basePriceCents: true,
      effectivePriceCents: true,
      currentDiscountPercent: true,
    },
  });

  const totalDiscountPercentIssued = roundPercent(
    subscriptions.reduce(
      (sum, subscription) =>
        sum + decimalToNumber(subscription.currentDiscountPercent),
      0,
    ),
  );
  const averageDiscountPerUser =
    subscriptions.length === 0
      ? 0
      : roundPercent(totalDiscountPercentIssued / subscriptions.length);
  const highestDiscountSubscription =
    subscriptions.reduce<{
      customerId: string;
      subscriptionId: string;
      discountPercent: number;
    } | null>((highest, subscription) => {
      const discountPercent = decimalToNumber(subscription.currentDiscountPercent);

      if (!highest || discountPercent > highest.discountPercent) {
        return {
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          discountPercent,
        };
      }

      return highest;
    }, null);
  const grossRevenueCents = subscriptions.reduce(
    (sum, subscription) => sum + subscription.basePriceCents,
    0,
  );
  const discountedRevenueCents = subscriptions.reduce(
    (sum, subscription) => sum + subscription.effectivePriceCents,
    0,
  );
  const revenueDiscountedPercent =
    grossRevenueCents === 0
      ? 0
      : roundPercent(
          ((grossRevenueCents - discountedRevenueCents) / grossRevenueCents) * 100,
        );

  return {
    businessId,
    totalDiscountPercentIssued,
    averageDiscountPerUser,
    highestDiscountUser: highestDiscountSubscription,
    revenueDiscountedPercent,
  };
}

async function logBusinessDiscountRiskIfNeeded(
  businessId: string,
  db: DbClient,
) {
  const analytics = await getBusinessReferralDiscountAnalytics(businessId, db);
  const highestUserDiscount = analytics.highestDiscountUser?.discountPercent ?? 0;

  if (
    analytics.averageDiscountPerUser <= 30 &&
    highestUserDiscount <= 50
  ) {
    return analytics;
  }

  console.warn(
    "BUSINESS_DISCOUNT_RISK",
    JSON.stringify({
      businessId,
      averageDiscountPerUser: analytics.averageDiscountPerUser,
      highestDiscountUser: analytics.highestDiscountUser,
      totalDiscountPercentIssued: analytics.totalDiscountPercentIssued,
      revenueDiscountedPercent: analytics.revenueDiscountedPercent,
    }),
  );

  logReferralDebug("business.discount_risk", analytics);

  return analytics;
}

export async function getActiveReferralCount(
  customerId: string,
  db: DbClient = prisma,
) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { businessId: true },
  });

  if (!customer) {
    return 0;
  }

  return db.referral.count({
    where: {
      businessId: customer.businessId,
      referrerCustomerId: customerId,
      status: ReferralStatus.ACTIVE,
      referredSubscription: {
        status: SubscriptionStatus.ACTIVE,
        deletedAt: null,
      },
    },
  });
}

export async function calculateCustomerReferralDiscount(
  customerId: string,
  db: DbClient = prisma,
  options: RecalculationOptions = {},
): Promise<ReferralDiscountBreakdown> {
  const activeSubscription = await resolveActiveSubscription(customerId, db);

  if (!activeSubscription) {
    logReferralDebug("recalculation.skipped", {
      customerId,
      reason: options.reason ?? "manual",
      activeReferralCount: 0,
      evaluatedSubscriptions: [],
      message: "Customer has no active subscription.",
    });

    return buildNoActiveSubscriptionBreakdown(customerId);
  }

  const previousDiscountPercent = decimalToNumber(
    activeSubscription.currentDiscountPercent,
  );
  const previousEffectivePriceCents = activeSubscription.effectivePriceCents;
  const debugEnabled = isReferralDebugEnabled();

  const [
    {
      referralProgramEnabled,
      referralPercent,
      maxDiscountPercent,
      minPriceCents,
    },
    activeReferralCount,
    evaluatedSubscriptions,
  ] =
    await Promise.all([
      resolveApplicableReferralRule(
        activeSubscription.businessId,
        activeSubscription.planId,
        db,
      ),
      getActiveReferralCount(customerId, db),
      debugEnabled
        ? loadReferralEvaluationSnapshot(
            customerId,
            activeSubscription.businessId,
            db,
          )
        : Promise.resolve([]),
    ]);

  const configuredDiscountPercent = referralProgramEnabled
    ? calculateStoredDiscountPercent(
        activeReferralCount,
        referralPercent,
        maxDiscountPercent,
      )
    : 0;
  const discountAmountCents = calculateAppliedDiscountAmountCents(
    activeSubscription.basePriceCents,
    configuredDiscountPercent,
    minPriceCents,
  );
  const effectivePriceCents = Math.max(
    activeSubscription.basePriceCents - discountAmountCents,
    minPriceCents ?? 0,
  );
  const totalDiscountPercent = calculateAppliedDiscountPercent(
    activeSubscription.basePriceCents,
    discountAmountCents,
  );

  const breakdown: ReferralDiscountBreakdown = {
    customerId,
    subscriptionId: activeSubscription.id,
    basePriceCents: activeSubscription.basePriceCents,
    referralPercent,
    activeReferralCount,
    totalDiscountPercent,
    discountAmountCents,
    effectivePriceCents,
  };

  await db.subscription.update({
    where: {
      id: activeSubscription.id,
    },
    data: {
      currentDiscountPercent: totalDiscountPercent,
      effectivePriceCents,
    },
  });

  await db.billingEvent.create({
    data: {
      businessId: activeSubscription.businessId,
      customerId,
      subscriptionId: activeSubscription.id,
      type:
        totalDiscountPercent > 0
          ? BillingEventType.DISCOUNT_APPLIED
          : BillingEventType.DISCOUNT_REMOVED,
      status: BillingEventStatus.SUCCEEDED,
      amountCents: activeSubscription.basePriceCents,
      discountPercent: totalDiscountPercent,
      discountAmountCents,
      effectivePriceCents,
      metadata: {
        activeReferralCount,
        referralProgramEnabled,
        referralPercent,
        configuredDiscountPercent,
        maxDiscountPercent,
        minPriceCents,
        oldDiscountPercent: previousDiscountPercent,
        newDiscountPercent: totalDiscountPercent,
        oldEffectivePriceCents: previousEffectivePriceCents,
        newEffectivePriceCents: effectivePriceCents,
        reason: options.reason ?? "manual",
        changed:
          previousDiscountPercent !== totalDiscountPercent ||
          previousEffectivePriceCents !== effectivePriceCents,
      },
    },
  });

  logReferralDebug("recalculation.completed", {
    customerId,
    subscriptionId: activeSubscription.id,
    reason: options.reason ?? "manual",
    basePriceCents: activeSubscription.basePriceCents,
    referralPercent,
    activeReferralCount,
    referralProgramEnabled,
    configuredDiscountPercent,
    maxDiscountPercent,
    minPriceCents,
    totalDiscountPercent,
    discountAmountCents,
    effectivePriceCents,
    previousDiscountPercent,
    previousEffectivePriceCents,
    evaluatedSubscriptions: evaluatedSubscriptions.map((referral) => ({
      referralId: referral.id,
      referredCustomerId: referral.referredCustomerId,
      referralStatus: referral.status,
      referredSubscriptionId: referral.referredSubscription?.id ?? null,
      referredSubscriptionStatus:
        referral.referredSubscription?.status ?? "MISSING",
    })),
  });

  await logBusinessDiscountRiskIfNeeded(activeSubscription.businessId, db);

  return breakdown;
}

export async function recalculateDiscountsForReferrer(
  referrerCustomerId: string,
  db: DbClient = prisma,
  options: RecalculationOptions = {},
) {
  return calculateCustomerReferralDiscount(referrerCustomerId, db, options);
}

export async function createReferralRelationship(input: {
  businessId: string;
  referrerCustomerId: string;
  referredCustomerId: string;
  referralCodeUsed: string;
  referredSubscriptionId?: string | null;
  db?: DbClient;
}) {
  const db = input.db ?? prisma;

  if (input.referrerCustomerId === input.referredCustomerId) {
    throw new Error("Self-referrals are not allowed.");
  }

  const [referrerCustomer, referredCustomer, existingReferral] = await Promise.all([
    db.customer.findUniqueOrThrow({
      where: { id: input.referrerCustomerId },
      include: {
        business: true,
      },
    }),
    db.customer.findUniqueOrThrow({
      where: { id: input.referredCustomerId },
      include: {
        business: true,
      },
    }),
    db.referral.findUnique({
      where: {
        referredCustomerId: input.referredCustomerId,
      },
    }),
  ]);

  if (!referrerCustomer.business.referralProgramEnabled) {
    return null;
  }

  if (referrerCustomer.businessId !== input.businessId) {
    throw new Error("Referrer does not belong to the provided business.");
  }

  if (referredCustomer.businessId !== input.businessId) {
    throw new Error("Referred customer does not belong to the provided business.");
  }

  if (
    existingReferral &&
    existingReferral.referrerCustomerId !== input.referrerCustomerId
  ) {
    throw new Error("This customer has already been referred.");
  }

  const activeSubscription = await resolveActiveSubscription(
    input.referrerCustomerId,
    db,
  );
  const applicableRate = activeSubscription
    ? await resolveApplicableReferralRule(
        activeSubscription.businessId,
        activeSubscription.planId,
        db,
      )
    : {
        referralPercent: decimalToNumber(
          referrerCustomer.business.defaultReferralPercent,
        ),
        maxDiscountPercent: decimalToNumber(
          referrerCustomer.business.maxReferralDiscountPercent,
        ),
        minPriceCents: null,
        referralProgramEnabled: referrerCustomer.business.referralProgramEnabled,
      };

  validateReferralProgramConfiguration({
    referralPercent: applicableRate.referralPercent,
    maxDiscountPercent: applicableRate.maxDiscountPercent,
    basePriceCents: activeSubscription?.basePriceCents ?? null,
    minPriceCents: applicableRate.minPriceCents,
  });

  return db.referral.upsert({
    where: {
      referredCustomerId: referredCustomer.id,
    },
    update: {
      referralCodeUsed: input.referralCodeUsed,
      referredSubscriptionId:
        input.referredSubscriptionId ?? existingReferral?.referredSubscriptionId,
    },
    create: {
      businessId: input.businessId,
      referrerCustomerId: referrerCustomer.id,
      referredCustomerId: referredCustomer.id,
      referredSubscriptionId: input.referredSubscriptionId,
      referralCodeUsed: input.referralCodeUsed,
      discountPercentAtCreation: applicableRate.referralPercent,
      status: ReferralStatus.PENDING,
    },
  });
}

export async function recalculateDiscountsImpactedBySubscription(
  subscriptionId: string,
  db: DbClient = prisma,
  options: RecalculationOptions = {},
) {
  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      customer: {
        include: {
          referralReceived: true,
        },
      },
    },
  });

  if (!subscription) {
    throw new Error("Subscription not found.");
  }

  const impactedCustomerIds = new Set<string>();

  if (subscription.customer.referralReceived) {
    const currentReferral = subscription.customer.referralReceived;
    const nextReferralStatus = resolveNextReferralStatus({
      currentStatus: currentReferral.status,
      referredSubscriptionStatus: subscription.status,
      activatedAt: currentReferral.activatedAt,
    });

    await db.referral.update({
      where: {
        id: currentReferral.id,
      },
      data: {
        referredSubscriptionId: subscription.id,
        status: nextReferralStatus,
        activatedAt:
          nextReferralStatus === ReferralStatus.ACTIVE
            ? currentReferral.activatedAt ?? new Date()
            : currentReferral.activatedAt,
        deactivatedAt:
          nextReferralStatus === ReferralStatus.INACTIVE
            ? currentReferral.deactivatedAt ?? new Date()
            : null,
      },
    });

    logReferralDebug("referral.lifecycle.updated", {
      subscriptionId,
      referralId: currentReferral.id,
      currentReferralStatus: currentReferral.status,
      nextReferralStatus,
      evaluatedSubscriptionStatus: subscription.status,
      reason: options.reason ?? "manual",
    });

    impactedCustomerIds.add(currentReferral.referrerCustomerId);
  }

  if (isEligibleForActiveReferral(subscription.status)) {
    impactedCustomerIds.add(subscription.customerId);
  }

  const results: ReferralDiscountBreakdown[] = [];

  for (const customerId of impactedCustomerIds) {
    results.push(
      await calculateCustomerReferralDiscount(customerId, db, options),
    );
  }

  return {
    subscriptionId,
    impactedCustomerIds: Array.from(impactedCustomerIds),
    results,
  };
}



