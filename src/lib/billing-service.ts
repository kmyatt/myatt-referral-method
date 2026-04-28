import { SubscriptionStatus } from "@prisma/client";

import { ACTIVE_REFERRAL_SUBSCRIPTION_STATUSES } from "@/lib/constants";
import {
  type RecalculationReason,
  recalculateDiscountsImpactedBySubscription,
} from "@/lib/referral-service";

export function isSubscriptionActiveForReferral(status: SubscriptionStatus) {
  return ACTIVE_REFERRAL_SUBSCRIPTION_STATUSES.includes(status);
}

export function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "past_due":
      return SubscriptionStatus.PAST_DUE;
    case "unpaid":
      return SubscriptionStatus.UNPAID;
    case "paused":
      return SubscriptionStatus.PAUSED;
    case "canceled":
      return SubscriptionStatus.CANCELED;
    case "incomplete":
    default:
      return SubscriptionStatus.INCOMPLETE;
  }
}

export async function handleSubscriptionStatusChange(
  subscriptionId: string,
  reason: RecalculationReason | string = "manual",
) {
  return recalculateDiscountsImpactedBySubscription(subscriptionId, undefined, {
    reason,
  });
}
