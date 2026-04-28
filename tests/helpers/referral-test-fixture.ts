import { Prisma, ReferralStatus, SubscriptionStatus } from "@prisma/client";

type BusinessRecord = {
  id: string;
  name: string;
  slug: string;
  defaultReferralPercent: Prisma.Decimal;
  maxReferralDiscountPercent: Prisma.Decimal | null;
  referralProgramEnabled: boolean;
};

type PlanRecord = {
  id: string;
  businessId: string;
  priceCents: number;
  minPriceCents: number | null;
  referralPercentOverride: Prisma.Decimal | null;
  maxDiscountPercent: Prisma.Decimal | null;
};

type CustomerRecord = {
  id: string;
  businessId: string;
  email: string;
  referralCode: string;
};

type SubscriptionRecord = {
  id: string;
  businessId: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  basePriceCents: number;
  effectivePriceCents: number;
  currentDiscountPercent: Prisma.Decimal;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  pausedAt: Date | null;
  lastStripeEventCreatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type ReferralRecord = {
  id: string;
  businessId: string;
  referrerCustomerId: string;
  referredCustomerId: string;
  referredSubscriptionId: string | null;
  referralCodeUsed: string;
  status: ReferralStatus;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
  discountPercentAtCreation: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
};

type ReferralRuleRecord = {
  id: string;
  businessId: string;
  planId: string | null;
  referralPercent: Prisma.Decimal;
  maxDiscountPercent: Prisma.Decimal | null;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

type BillingEventRecord = {
  id: string;
  [key: string]: unknown;
};

function clone<T>(value: T): T {
  if (value instanceof Prisma.Decimal) {
    return new Prisma.Decimal(value) as T;
  }

  if (value instanceof Date) {
    return new Date(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clone(item)]),
    ) as T;
  }

  return value;
}

function applySelect<T extends Record<string, unknown>>(
  record: T,
  select?: Record<string, boolean>,
) {
  if (!select) {
    return clone(record);
  }

  return Object.fromEntries(
    Object.entries(select)
      .filter(([, enabled]) => enabled)
      .map(([key]) => [key, clone(record[key as keyof T])]),
  );
}

function sortByCreatedDesc<T extends { createdAt: Date }>(records: T[]) {
  return [...records].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function sortByCreatedAsc<T extends { createdAt: Date }>(records: T[]) {
  return [...records].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function createReferralTestFixture() {
  const now = new Date("2026-04-26T12:00:00.000Z");
  const business: BusinessRecord = {
    id: "business_1",
    name: "Acme Fitness",
    slug: "acme-fitness",
    defaultReferralPercent: new Prisma.Decimal(5),
    maxReferralDiscountPercent: null,
    referralProgramEnabled: true,
  };

  const plan: PlanRecord = {
    id: "plan_1",
    businessId: business.id,
    priceCents: 25_000,
    minPriceCents: null,
    referralPercentOverride: null,
    maxDiscountPercent: null,
  };

  const customers: CustomerRecord[] = [
    {
      id: "customer_a",
      businessId: business.id,
      email: "a@example.com",
      referralCode: "REF-A",
    },
    {
      id: "customer_b",
      businessId: business.id,
      email: "b@example.com",
      referralCode: "REF-B",
    },
    {
      id: "customer_c",
      businessId: business.id,
      email: "c@example.com",
      referralCode: "REF-C",
    },
    {
      id: "customer_d",
      businessId: business.id,
      email: "d@example.com",
      referralCode: "REF-D",
    },
  ];

  const subscriptions: SubscriptionRecord[] = customers.map((customer, index) => ({
    id: `subscription_${index + 1}`,
    businessId: business.id,
    customerId: customer.id,
    planId: plan.id,
    status:
      customer.id === "customer_a"
        ? SubscriptionStatus.ACTIVE
        : SubscriptionStatus.INCOMPLETE,
    basePriceCents: plan.priceCents,
    effectivePriceCents: plan.priceCents,
    currentDiscountPercent: new Prisma.Decimal(0),
    stripeSubscriptionId: `stripe_sub_${index + 1}`,
    stripeCustomerId: `stripe_customer_${index + 1}`,
    stripePriceId: "price_monthly_250",
    currentPeriodStart: now,
    currentPeriodEnd: now,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    pausedAt: null,
    lastStripeEventCreatedAt: null,
    createdAt: new Date(now.getTime() + index * 1000),
    updatedAt: now,
    deletedAt: null,
  }));

  const referrals: ReferralRecord[] = [];
  const referralDiscountRules: ReferralRuleRecord[] = [];
  const billingEvents: BillingEventRecord[] = [];

  let eventId = 0;

  const state = {
    business,
    plan,
    customers,
    subscriptions,
    referrals,
    referralDiscountRules,
    billingEvents,
  };

  const db = {
    business: {
      async findUniqueOrThrow(args: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) {
        if (args.where.id !== business.id) {
          throw new Error("Business not found.");
        }

        return applySelect(business, args.select);
      },
    },
    subscriptionPlan: {
      async findUniqueOrThrow(args: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) {
        if (args.where.id !== plan.id) {
          throw new Error("Plan not found.");
        }

        return applySelect(plan, args.select);
      },
    },
    customer: {
      async findUnique(args: {
        where: { id?: string; stripeCustomerId?: string };
        select?: Record<string, boolean>;
      }) {
        const record = state.customers.find((candidate) => {
          if (args.where.id) {
            return candidate.id === args.where.id;
          }

          if (args.where.stripeCustomerId) {
            const subscription = state.subscriptions.find(
              (item) => item.customerId === candidate.id,
            );
            return subscription?.stripeCustomerId === args.where.stripeCustomerId;
          }

          return false;
        });

        return record ? applySelect(record, args.select) : null;
      },
      async findUniqueOrThrow(args: {
        where: { id: string };
        include?: { business?: boolean };
      }) {
        const record = state.customers.find((candidate) => candidate.id === args.where.id);
        if (!record) {
          throw new Error("Customer not found.");
        }

        return {
          ...clone(record),
          ...(args.include?.business ? { business: clone(business) } : {}),
        };
      },
      async update(args: {
        where: { id: string };
        data: Partial<CustomerRecord> & { stripeCustomerId?: string | null };
      }) {
        const record = state.customers.find((candidate) => candidate.id === args.where.id);
        if (!record) {
          throw new Error("Customer not found.");
        }

        Object.assign(record, args.data);
        return clone(record);
      },
    },
    subscription: {
      async findFirst(args: {
        where: {
          customerId?: string;
          status?: SubscriptionStatus;
          deletedAt?: null;
        };
        include?: { plan?: boolean; business?: boolean; customer?: boolean };
        orderBy?: { createdAt: "asc" | "desc" };
      }) {
        let records = state.subscriptions.filter((subscription) => {
          if (args.where.customerId && subscription.customerId !== args.where.customerId) {
            return false;
          }
          if (args.where.status && subscription.status !== args.where.status) {
            return false;
          }
          if (args.where.deletedAt === null && subscription.deletedAt !== null) {
            return false;
          }
          return true;
        });

        records =
          args.orderBy?.createdAt === "asc"
            ? sortByCreatedAsc(records)
            : sortByCreatedDesc(records);
        const record = records[0];

        if (!record) {
          return null;
        }

        return {
          ...clone(record),
          ...(args.include?.plan ? { plan: clone(plan) } : {}),
          ...(args.include?.business ? { business: clone(business) } : {}),
          ...(args.include?.customer
            ? {
                customer: clone(
                  state.customers.find((candidate) => candidate.id === record.customerId)!,
                ),
              }
            : {}),
        };
      },
      async findUnique(args: {
        where: { id?: string; stripeSubscriptionId?: string };
        include?: {
          customer?: {
            include?: {
              referralReceived?: boolean;
            };
          };
        };
      }) {
        const record = state.subscriptions.find((subscription) => {
          if (args.where.id) {
            return subscription.id === args.where.id;
          }

          if (args.where.stripeSubscriptionId) {
            return subscription.stripeSubscriptionId === args.where.stripeSubscriptionId;
          }

          return false;
        });

        if (!record) {
          return null;
        }

        if (!args.include?.customer) {
          return clone(record);
        }

        const customer = state.customers.find(
          (candidate) => candidate.id === record.customerId,
        )!;
        const referralReceived = state.referrals.find(
          (candidate) => candidate.referredCustomerId === customer.id,
        );

        return {
          ...clone(record),
          customer: {
            ...clone(customer),
            ...(args.include.customer.include?.referralReceived
              ? { referralReceived: referralReceived ? clone(referralReceived) : null }
              : {}),
          },
        };
      },
      async update(args: {
        where: { id: string };
        data: Partial<SubscriptionRecord>;
      }) {
        const record = state.subscriptions.find(
          (candidate) => candidate.id === args.where.id,
        );
        if (!record) {
          throw new Error("Subscription not found.");
        }

        Object.assign(record, args.data, { updatedAt: new Date(now.getTime() + 10_000) });
        return clone(record);
      },
      async findMany(args: {
        where: {
          businessId: string;
          status?: SubscriptionStatus;
          deletedAt?: null;
        };
        select: {
          id: boolean;
          customerId: boolean;
          basePriceCents: boolean;
          effectivePriceCents: boolean;
          currentDiscountPercent: boolean;
        };
      }) {
        return state.subscriptions
          .filter((subscription) => {
            if (subscription.businessId !== args.where.businessId) return false;
            if (args.where.status && subscription.status !== args.where.status) return false;
            if (args.where.deletedAt === null && subscription.deletedAt !== null) {
              return false;
            }
            return true;
          })
          .map((subscription) => applySelect(subscription, args.select));
      },
    },
    referralDiscountRule: {
      async findFirst(args: {
        where: {
          businessId: string;
          planId: string | null;
          isActive: boolean;
          OR: Array<{ effectiveTo: null } | { effectiveTo: { gt: Date } }>;
        };
        orderBy?: { effectiveFrom: "asc" | "desc" };
      }) {
        const record = state.referralDiscountRules
          .filter((rule) => {
            if (rule.businessId !== args.where.businessId) return false;
            if (rule.planId !== args.where.planId) return false;
            if (rule.isActive !== args.where.isActive) return false;
            return rule.effectiveTo === null || rule.effectiveTo > now;
          })
          .sort((a, b) =>
            args.orderBy?.effectiveFrom === "asc"
              ? a.effectiveFrom.getTime() - b.effectiveFrom.getTime()
              : b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
          )[0];

        return record ? clone(record) : null;
      },
    },
    referral: {
      async count(args: {
        where: {
          businessId: string;
          referrerCustomerId: string;
          status: ReferralStatus;
          referredSubscription: {
            status: SubscriptionStatus;
            deletedAt: null;
          };
        };
      }) {
        return state.referrals.filter((referral) => {
          if (referral.businessId !== args.where.businessId) return false;
          if (referral.referrerCustomerId !== args.where.referrerCustomerId) return false;
          if (referral.status !== args.where.status) return false;
          const subscription = state.subscriptions.find(
            (candidate) => candidate.id === referral.referredSubscriptionId,
          );

          return (
            subscription?.status === args.where.referredSubscription.status &&
            subscription.deletedAt === args.where.referredSubscription.deletedAt
          );
        }).length;
      },
      async findUnique(args: { where: { referredCustomerId?: string; id?: string } }) {
        const record = state.referrals.find((referral) => {
          if (args.where.id) {
            return referral.id === args.where.id;
          }

          if (args.where.referredCustomerId) {
            return referral.referredCustomerId === args.where.referredCustomerId;
          }

          return false;
        });

        return record ? clone(record) : null;
      },
      async findMany(args: {
        where: { businessId: string; referrerCustomerId: string };
        select: {
          id: boolean;
          status: boolean;
          referredCustomerId: boolean;
          referredSubscription: {
            select: { id: boolean; status: boolean };
          };
        };
        orderBy?: { createdAt: "asc" | "desc" };
      }) {
        const records = state.referrals.filter(
          (referral) =>
            referral.businessId === args.where.businessId &&
            referral.referrerCustomerId === args.where.referrerCustomerId,
        );
        const ordered =
          args.orderBy?.createdAt === "desc"
            ? sortByCreatedDesc(records)
            : sortByCreatedAsc(records);

        return ordered.map((referral) => {
          const referredSubscription = state.subscriptions.find(
            (candidate) => candidate.id === referral.referredSubscriptionId,
          );

          return {
            id: referral.id,
            status: referral.status,
            referredCustomerId: referral.referredCustomerId,
            referredSubscription: referredSubscription
              ? {
                  id: referredSubscription.id,
                  status: referredSubscription.status,
                }
              : null,
          };
        });
      },
      async update(args: {
        where: { id: string };
        data: Partial<ReferralRecord>;
      }) {
        const record = state.referrals.find((referral) => referral.id === args.where.id);
        if (!record) {
          throw new Error("Referral not found.");
        }

        Object.assign(record, args.data, { updatedAt: new Date(now.getTime() + 20_000) });
        return clone(record);
      },
      async upsert(args: {
        where: { referredCustomerId: string };
        update: Partial<ReferralRecord>;
        create: Omit<ReferralRecord, "id" | "createdAt" | "updatedAt">;
      }) {
        const existing = state.referrals.find(
          (referral) => referral.referredCustomerId === args.where.referredCustomerId,
        );

        if (existing) {
          Object.assign(existing, args.update, {
            updatedAt: new Date(now.getTime() + 30_000),
          });
          return clone(existing);
        }

        const created: ReferralRecord = {
          id: `referral_${state.referrals.length + 1}`,
          createdAt: new Date(now.getTime() + state.referrals.length * 1000),
          updatedAt: new Date(now.getTime() + state.referrals.length * 1000),
          ...args.create,
        };
        state.referrals.push(created);
        return clone(created);
      },
    },
    billingEvent: {
      async create(args: { data: Record<string, unknown> }) {
        eventId += 1;
        const created = {
          id: `billing_event_${eventId}`,
          ...clone(args.data),
        };
        state.billingEvents.push(created);
        return created;
      },
    },
  };

  return {
    db,
    state,
    ids: {
      businessId: business.id,
      planId: plan.id,
      customerAId: "customer_a",
      customerBId: "customer_b",
      customerCId: "customer_c",
      customerDId: "customer_d",
      subscriptionAId: "subscription_1",
      subscriptionBId: "subscription_2",
      subscriptionCId: "subscription_3",
      subscriptionDId: "subscription_4",
    },
  };
}

