import { SubscriptionStatus } from "@prisma/client";

export const SESSION_COOKIE_NAME = "myatt_referral_session";
export const REFERRAL_COOKIE_NAME = "myatt_referral_code";
export const SESSION_DURATION_DAYS = 30;
export const DEFAULT_PLATFORM_FEE_PERCENT = 5;
export const DEFAULT_REFERRAL_PERCENT = 5;

export const ACTIVE_REFERRAL_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
];

export const CUSTOMER_INACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.CANCELED,
  SubscriptionStatus.PAUSED,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.EXPIRED,
  SubscriptionStatus.REFUNDED,
  SubscriptionStatus.PAST_DUE,
];
