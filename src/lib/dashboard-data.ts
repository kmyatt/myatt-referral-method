import { getPlatformAnalytics } from "@/lib/analytics-service";
import { prisma } from "@/lib/prisma";

export async function getBusinessDashboardData(businessId: string) {
  const analytics = await (await import("@/lib/analytics-service")).getBusinessAnalytics(businessId);
  const [plans, customers, referrals, recentEvents] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { businessId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.customer.findMany({
      where: { businessId, deletedAt: null },
      include: {
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { plan: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.referral.findMany({
      where: { businessId },
      include: {
        referrerCustomer: true,
        referredCustomer: true,
        referredSubscription: { include: { plan: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.billingEvent.findMany({ where: { businessId }, orderBy: { occurredAt: "desc" }, take: 8 }),
  ]);

  return { ...analytics, plans, customers, referrals, recentEvents };
}

export async function getCustomerDashboardData(customerId: string) {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: {
      business: true,
      subscriptions: { orderBy: { createdAt: "desc" }, include: { plan: true } },
      referralsSent: {
        include: { referredCustomer: true, referredSubscription: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const activeSubscription = customer.subscriptions.find((subscription) => subscription.status === "ACTIVE") ?? customer.subscriptions[0] ?? null;
  const activeReferrals = customer.referralsSent.filter((referral) => referral.status === "ACTIVE");
  const inactiveReferrals = customer.referralsSent.filter((referral) => referral.status !== "ACTIVE");

  return { customer, activeSubscription, activeReferrals, inactiveReferrals };
}

export async function getAdminDashboardData() {
  const [platformAnalytics, webhookEvents, businessRows] = await Promise.all([
    getPlatformAnalytics(),
    prisma.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { business: true } }),
    prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customers: true,
        subscriptions: true,
        referrals: { where: { status: "ACTIVE" } },
      },
    }),
  ]);

  return { ...platformAnalytics, webhookEvents, businessRows };
}

export async function getPublicBusinessPageData(slug: string) {
  return prisma.business.findUniqueOrThrow({
    where: { slug },
    include: {
      plans: {
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

export async function findBusinessByReferralCode(referralCode: string) {
  const customer = await prisma.customer.findUnique({
    where: { referralCode },
    include: { business: true },
  });

  return customer?.business ?? null;
}
