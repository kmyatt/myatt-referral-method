import { ReferralStatus, SubscriptionStatus } from "@prisma/client";

import { calculateDiscountAmountCents, decimalToNumber } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getBusinessReferralDiscountAnalytics } from "@/lib/referral-service";

const mrrStatuses: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE];
const churnStatuses: SubscriptionStatus[] = [
  SubscriptionStatus.CANCELED,
  SubscriptionStatus.EXPIRED,
  SubscriptionStatus.REFUNDED,
];

export function calculateGrossMrr(
  subscriptions: Array<{ status: SubscriptionStatus; basePriceCents: number }>,
) {
  return subscriptions
    .filter((subscription) => mrrStatuses.includes(subscription.status))
    .reduce((total, subscription) => total + subscription.basePriceCents, 0);
}

export function calculateDiscountedMrr(
  subscriptions: Array<{ status: SubscriptionStatus; effectivePriceCents: number }>,
) {
  return subscriptions
    .filter((subscription) => mrrStatuses.includes(subscription.status))
    .reduce((total, subscription) => total + subscription.effectivePriceCents, 0);
}

export function calculateNetMrr(
  subscriptions: Array<{ status: SubscriptionStatus; effectivePriceCents: number }>,
) {
  return calculateDiscountedMrr(subscriptions);
}

export function calculateTotalActiveReferralDiscounts(
  subscriptions: Array<{
    status: SubscriptionStatus;
    basePriceCents: number;
    currentDiscountPercent: number;
  }>,
) {
  return subscriptions
    .filter((subscription) => mrrStatuses.includes(subscription.status))
    .reduce(
      (total, subscription) =>
        total +
        calculateDiscountAmountCents(
          subscription.basePriceCents,
          subscription.currentDiscountPercent,
        ),
      0,
    );
}

export function calculateReferralConversionRate(totalReferredCustomers: number, totalActiveReferrals: number) {
  if (totalReferredCustomers === 0) return 0;
  return (totalActiveReferrals / totalReferredCustomers) * 100;
}

export function calculateChurnRate(totalCustomers: number, churnedCustomers: number) {
  if (totalCustomers === 0) return 0;
  return (churnedCustomers / totalCustomers) * 100;
}

export async function getBusinessAnalytics(businessId: string) {
  const [business, subscriptions, referrals, customers, discountAnalytics] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, name: true, slug: true, currency: true },
    }),
    prisma.subscription.findMany({
      where: { businessId },
      select: {
        id: true,
        status: true,
        basePriceCents: true,
        currentDiscountPercent: true,
        effectivePriceCents: true,
        createdAt: true,
      },
    }),
    prisma.referral.findMany({
      where: { businessId },
      select: { id: true, status: true, createdAt: true },
    }),
    prisma.customer.findMany({
      where: { businessId },
      select: { id: true, status: true, createdAt: true },
    }),
    getBusinessReferralDiscountAnalytics(businessId),
  ]);

  const activeSubscribers = subscriptions.filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE).length;
  const activeReferrals = referrals.filter((referral) => referral.status === ReferralStatus.ACTIVE).length;
  const churnedSubscribers = subscriptions.filter((subscription) => churnStatuses.includes(subscription.status)).length;
  const grossMrr = calculateGrossMrr(subscriptions);
  const discountedMrr = calculateDiscountedMrr(subscriptions);
  const totalDiscountsIssued = calculateTotalActiveReferralDiscounts(
    subscriptions.map((subscription) => ({
      ...subscription,
      currentDiscountPercent: decimalToNumber(subscription.currentDiscountPercent),
    })),
  );
  const averageReferralsPerSubscriber = activeSubscribers === 0 ? 0 : referrals.length / activeSubscribers;

  const now = new Date();
  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      label: month.toLocaleDateString("en-US", { month: "short" }),
      subscriptions: subscriptions.filter(
        (subscription) =>
          subscription.createdAt.getMonth() === month.getMonth() &&
          subscription.createdAt.getFullYear() === month.getFullYear(),
      ).length,
      referrals: referrals.filter(
        (referral) =>
          referral.createdAt.getMonth() === month.getMonth() &&
          referral.createdAt.getFullYear() === month.getFullYear(),
      ).length,
    };
  });

  return {
    business,
    metrics: {
      grossMrr,
      discountedMrr,
      netMrr: calculateNetMrr(subscriptions),
      totalActiveReferralDiscounts: totalDiscountsIssued,
      activeSubscribers,
      activeReferrals,
      referralGeneratedSubscribers: activeReferrals,
      churnedSubscribers,
      averageReferralsPerSubscriber,
      referralConversionRate: calculateReferralConversionRate(referrals.length, activeReferrals),
      churnRate: calculateChurnRate(customers.length, churnedSubscribers),
      totalDiscountPercentIssued: discountAnalytics.totalDiscountPercentIssued,
      averageDiscountPerUser: discountAnalytics.averageDiscountPerUser,
      highestDiscountUser: discountAnalytics.highestDiscountUser,
      revenueDiscountedPercent: discountAnalytics.revenueDiscountedPercent,
    },
    warnings:
      discountAnalytics.averageDiscountPerUser > 30 ||
      (discountAnalytics.highestDiscountUser?.discountPercent ?? 0) > 50
        ? [
            {
              code: "BUSINESS_DISCOUNT_RISK",
              averageDiscountPerUser: discountAnalytics.averageDiscountPerUser,
              highestDiscountUser: discountAnalytics.highestDiscountUser,
              revenueDiscountedPercent: discountAnalytics.revenueDiscountedPercent,
            },
          ]
        : [],
    monthlyTrend,
  };
}

export async function getPlatformAnalytics() {
  const businesses = await prisma.business.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      customers: { select: { id: true } },
      subscriptions: {
        select: {
          id: true,
          status: true,
          basePriceCents: true,
          effectivePriceCents: true,
          currentDiscountPercent: true,
        },
      },
      referrals: { select: { id: true, status: true } },
    },
  });

  const businessRollups = businesses.map((business) => ({
    id: business.id,
    name: business.name,
    slug: business.slug,
    status: business.status,
    subscribers: business.customers.length,
    activeReferrals: business.referrals.filter((referral) => referral.status === ReferralStatus.ACTIVE).length,
    grossMrr: calculateGrossMrr(business.subscriptions),
    netMrr: calculateNetMrr(business.subscriptions),
  }));

  return {
    totalBusinesses: businesses.length,
    platformMrr: businessRollups.reduce((sum, business) => sum + business.netMrr, 0),
    totalSubscriptionVolume: businessRollups.reduce((sum, business) => sum + business.grossMrr, 0),
    totalDiscountsGenerated: businesses.reduce(
      (sum, business) =>
        sum +
        calculateTotalActiveReferralDiscounts(
          business.subscriptions.map((subscription) => ({
            ...subscription,
            currentDiscountPercent: decimalToNumber(subscription.currentDiscountPercent),
          })),
        ),
      0,
    ),
    businesses: businessRollups.sort((left, right) => right.netMrr - left.netMrr),
  };
}

