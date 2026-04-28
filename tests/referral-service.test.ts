import assert from "node:assert/strict";
import test from "node:test";

import { Prisma, ReferralStatus, SubscriptionStatus } from "@prisma/client";

import {
  calculateCustomerReferralDiscount,
  createReferralRelationship,
  getActiveReferralCount,
  getBusinessReferralDiscountAnalytics,
  recalculateDiscountsImpactedBySubscription,
  validateReferralProgramConfiguration,
} from "../src/lib/referral-service";
import { planSchema } from "../src/lib/validators";
import { createReferralTestFixture } from "./helpers/referral-test-fixture";

async function createPendingReferral(
  fixture: ReturnType<typeof createReferralTestFixture>,
  referredCustomerId: string,
  referredSubscriptionId: string,
) {
  return createReferralRelationship({
    businessId: fixture.ids.businessId,
    referrerCustomerId: fixture.ids.customerAId,
    referredCustomerId,
    referralCodeUsed: "REF-A",
    referredSubscriptionId,
    db: fixture.db as never,
  });
}

test("basic flow: active referred subscriber gives the referrer a discount", async () => {
  const fixture = createReferralTestFixture();

  await createPendingReferral(
    fixture,
    fixture.ids.customerBId,
    fixture.ids.subscriptionBId,
  );

  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionBId },
    data: { status: SubscriptionStatus.ACTIVE },
  });

  await recalculateDiscountsImpactedBySubscription(
    fixture.ids.subscriptionBId,
    fixture.db as never,
    { reason: "customer.subscription.updated" },
  );

  const discount = await calculateCustomerReferralDiscount(
    fixture.ids.customerAId,
    fixture.db as never,
  );

  assert.equal(discount.activeReferralCount, 1);
  assert.equal(discount.referralPercent, 5);
  assert.equal(discount.totalDiscountPercent, 5);
  assert.equal(discount.discountAmountCents, 1_250);
  assert.equal(discount.effectivePriceCents, 23_750);
  assert.equal(fixture.state.referrals[0]?.status, ReferralStatus.ACTIVE);
});

test("cancellation removes the discount from the referrer", async () => {
  const fixture = createReferralTestFixture();

  await createPendingReferral(
    fixture,
    fixture.ids.customerBId,
    fixture.ids.subscriptionBId,
  );
  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionBId },
    data: { status: SubscriptionStatus.ACTIVE },
  });
  await recalculateDiscountsImpactedBySubscription(
    fixture.ids.subscriptionBId,
    fixture.db as never,
  );

  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionBId },
    data: { status: SubscriptionStatus.CANCELED },
  });

  await recalculateDiscountsImpactedBySubscription(
    fixture.ids.subscriptionBId,
    fixture.db as never,
    { reason: "customer.subscription.deleted" },
  );

  const discount = await calculateCustomerReferralDiscount(
    fixture.ids.customerAId,
    fixture.db as never,
  );

  assert.equal(discount.activeReferralCount, 0);
  assert.equal(discount.totalDiscountPercent, 0);
  assert.equal(discount.effectivePriceCents, 25_000);
  assert.equal(fixture.state.referrals[0]?.status, ReferralStatus.INACTIVE);
});

test("payment failure removes the discount from the referrer", async () => {
  const fixture = createReferralTestFixture();

  await createPendingReferral(
    fixture,
    fixture.ids.customerBId,
    fixture.ids.subscriptionBId,
  );
  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionBId },
    data: { status: SubscriptionStatus.ACTIVE },
  });
  await recalculateDiscountsImpactedBySubscription(
    fixture.ids.subscriptionBId,
    fixture.db as never,
  );

  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionBId },
    data: { status: SubscriptionStatus.PAST_DUE },
  });

  await recalculateDiscountsImpactedBySubscription(
    fixture.ids.subscriptionBId,
    fixture.db as never,
    { reason: "invoice.payment_failed" },
  );

  const discount = await calculateCustomerReferralDiscount(
    fixture.ids.customerAId,
    fixture.db as never,
  );

  assert.equal(discount.activeReferralCount, 0);
  assert.equal(discount.totalDiscountPercent, 0);
  assert.equal(fixture.state.referrals[0]?.status, ReferralStatus.INACTIVE);
});

test("re-activation restores the discount", async () => {
  const fixture = createReferralTestFixture();

  await createPendingReferral(
    fixture,
    fixture.ids.customerBId,
    fixture.ids.subscriptionBId,
  );
  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionBId },
    data: { status: SubscriptionStatus.ACTIVE },
  });
  await recalculateDiscountsImpactedBySubscription(
    fixture.ids.subscriptionBId,
    fixture.db as never,
  );

  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionBId },
    data: { status: SubscriptionStatus.PAUSED },
  });
  await recalculateDiscountsImpactedBySubscription(
    fixture.ids.subscriptionBId,
    fixture.db as never,
  );

  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionBId },
    data: { status: SubscriptionStatus.ACTIVE },
  });
  await recalculateDiscountsImpactedBySubscription(
    fixture.ids.subscriptionBId,
    fixture.db as never,
  );

  const discount = await calculateCustomerReferralDiscount(
    fixture.ids.customerAId,
    fixture.db as never,
  );

  assert.equal(discount.activeReferralCount, 1);
  assert.equal(discount.totalDiscountPercent, 5);
  assert.equal(fixture.state.referrals[0]?.status, ReferralStatus.ACTIVE);
});

test("multiple active referrals stack without an implicit cap", async () => {
  const fixture = createReferralTestFixture();

  for (const [customerId, subscriptionId] of [
    [fixture.ids.customerBId, fixture.ids.subscriptionBId],
    [fixture.ids.customerCId, fixture.ids.subscriptionCId],
    [fixture.ids.customerDId, fixture.ids.subscriptionDId],
  ] as const) {
    await createPendingReferral(fixture, customerId, subscriptionId);
    await fixture.db.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.ACTIVE },
    });
    await recalculateDiscountsImpactedBySubscription(
      subscriptionId,
      fixture.db as never,
    );
  }

  const discount = await calculateCustomerReferralDiscount(
    fixture.ids.customerAId,
    fixture.db as never,
  );

  assert.equal(discount.activeReferralCount, 3);
  assert.equal(discount.totalDiscountPercent, 15);
  assert.equal(discount.discountAmountCents, 3_750);
  assert.equal(discount.effectivePriceCents, 21_250);
});

test("business-level max cap works", async () => {
  const fixture = createReferralTestFixture();
  fixture.state.business.maxReferralDiscountPercent = new Prisma.Decimal(10);

  for (const [customerId, subscriptionId] of [
    [fixture.ids.customerBId, fixture.ids.subscriptionBId],
    [fixture.ids.customerCId, fixture.ids.subscriptionCId],
    [fixture.ids.customerDId, fixture.ids.subscriptionDId],
  ] as const) {
    await createPendingReferral(fixture, customerId, subscriptionId);
    await fixture.db.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.ACTIVE },
    });
    await recalculateDiscountsImpactedBySubscription(subscriptionId, fixture.db as never);
  }

  const discount = await calculateCustomerReferralDiscount(fixture.ids.customerAId, fixture.db as never);

  assert.equal(discount.activeReferralCount, 3);
  assert.equal(discount.totalDiscountPercent, 10);
  assert.equal(discount.effectivePriceCents, 22_500);
});

test("plan-level max cap overrides to the safer limit", async () => {
  const fixture = createReferralTestFixture();
  fixture.state.business.maxReferralDiscountPercent = new Prisma.Decimal(20);
  fixture.state.plan.maxDiscountPercent = new Prisma.Decimal(8);

  for (const [customerId, subscriptionId] of [
    [fixture.ids.customerBId, fixture.ids.subscriptionBId],
    [fixture.ids.customerCId, fixture.ids.subscriptionCId],
  ] as const) {
    await createPendingReferral(fixture, customerId, subscriptionId);
    await fixture.db.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.ACTIVE },
    });
    await recalculateDiscountsImpactedBySubscription(subscriptionId, fixture.db as never);
  }

  const discount = await calculateCustomerReferralDiscount(fixture.ids.customerAId, fixture.db as never);

  assert.equal(discount.activeReferralCount, 2);
  assert.equal(discount.totalDiscountPercent, 8);
  assert.equal(discount.effectivePriceCents, 23_000);
});

test("disabled referral program removes discounts and blocks new referrals", async () => {
  const fixture = createReferralTestFixture();

  await createPendingReferral(fixture, fixture.ids.customerBId, fixture.ids.subscriptionBId);
  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionBId },
    data: { status: SubscriptionStatus.ACTIVE },
  });
  await recalculateDiscountsImpactedBySubscription(fixture.ids.subscriptionBId, fixture.db as never);

  fixture.state.business.referralProgramEnabled = false;

  const discount = await calculateCustomerReferralDiscount(fixture.ids.customerAId, fixture.db as never);
  const blockedReferral = await createReferralRelationship({
    businessId: fixture.ids.businessId,
    referrerCustomerId: fixture.ids.customerAId,
    referredCustomerId: fixture.ids.customerCId,
    referralCodeUsed: "REF-A",
    referredSubscriptionId: fixture.ids.subscriptionCId,
    db: fixture.db as never,
  });

  assert.equal(discount.activeReferralCount, 1);
  assert.equal(discount.totalDiscountPercent, 0);
  assert.equal(discount.effectivePriceCents, 25_000);
  assert.equal(blockedReferral, null);
});

test("minimum price floor is enforced", async () => {
  const fixture = createReferralTestFixture();
  fixture.state.plan.minPriceCents = 22_000;

  for (const [customerId, subscriptionId] of [
    [fixture.ids.customerBId, fixture.ids.subscriptionBId],
    [fixture.ids.customerCId, fixture.ids.subscriptionCId],
    [fixture.ids.customerDId, fixture.ids.subscriptionDId],
  ] as const) {
    await createPendingReferral(fixture, customerId, subscriptionId);
    await fixture.db.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.ACTIVE },
    });
    await recalculateDiscountsImpactedBySubscription(subscriptionId, fixture.db as never);
  }

  const discount = await calculateCustomerReferralDiscount(fixture.ids.customerAId, fixture.db as never);

  assert.equal(discount.activeReferralCount, 3);
  assert.equal(discount.discountAmountCents, 3_000);
  assert.equal(discount.totalDiscountPercent, 12);
  assert.equal(discount.effectivePriceCents, 22_000);
});

test("business analytics expose discount-risk metrics", async () => {
  const fixture = createReferralTestFixture();
  fixture.state.plan.maxDiscountPercent = new Prisma.Decimal(60);

  for (const [customerId, subscriptionId] of [
    [fixture.ids.customerBId, fixture.ids.subscriptionBId],
    [fixture.ids.customerCId, fixture.ids.subscriptionCId],
    [fixture.ids.customerDId, fixture.ids.subscriptionDId],
  ] as const) {
    await createPendingReferral(fixture, customerId, subscriptionId);
    await fixture.db.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.ACTIVE },
    });
    await recalculateDiscountsImpactedBySubscription(subscriptionId, fixture.db as never);
  }

  fixture.state.subscriptions[1]!.currentDiscountPercent = new Prisma.Decimal(35);
  fixture.state.subscriptions[1]!.effectivePriceCents = 16_250;
  fixture.state.subscriptions[2]!.status = SubscriptionStatus.ACTIVE;
  fixture.state.subscriptions[2]!.currentDiscountPercent = new Prisma.Decimal(10);
  fixture.state.subscriptions[2]!.effectivePriceCents = 22_500;

  const analytics = await getBusinessReferralDiscountAnalytics(fixture.ids.businessId, fixture.db as never);

  assert.equal(analytics.totalDiscountPercentIssued, 60);
  assert.equal(analytics.averageDiscountPerUser, 15);
  assert.equal(analytics.highestDiscountUser?.customerId, fixture.ids.customerBId);
  assert.equal(analytics.highestDiscountUser?.discountPercent, 35);
  assert.equal(analytics.revenueDiscountedPercent, 15);
});

test("edge cases: self-referrals are blocked", async () => {
  const fixture = createReferralTestFixture();

  await assert.rejects(
    createReferralRelationship({
      businessId: fixture.ids.businessId,
      referrerCustomerId: fixture.ids.customerAId,
      referredCustomerId: fixture.ids.customerAId,
      referralCodeUsed: "REF-A",
      referredSubscriptionId: fixture.ids.subscriptionAId,
      db: fixture.db as never,
    }),
    /Self-referrals are not allowed/,
  );
});

test("edge cases: duplicate referrals are blocked across referrers", async () => {
  const fixture = createReferralTestFixture();

  await createPendingReferral(
    fixture,
    fixture.ids.customerBId,
    fixture.ids.subscriptionBId,
  );

  await assert.rejects(
    createReferralRelationship({
      businessId: fixture.ids.businessId,
      referrerCustomerId: fixture.ids.customerCId,
      referredCustomerId: fixture.ids.customerBId,
      referralCodeUsed: "REF-C",
      referredSubscriptionId: fixture.ids.subscriptionBId,
      db: fixture.db as never,
    }),
    /already been referred/,
  );
});

test("edge cases: pending referrals that never activate do not create discounts", async () => {
  const fixture = createReferralTestFixture();

  await createPendingReferral(
    fixture,
    fixture.ids.customerBId,
    fixture.ids.subscriptionBId,
  );

  await recalculateDiscountsImpactedBySubscription(
    fixture.ids.subscriptionBId,
    fixture.db as never,
    { reason: "customer.subscription.created" },
  );

  const discount = await calculateCustomerReferralDiscount(
    fixture.ids.customerAId,
    fixture.db as never,
  );

  assert.equal(discount.activeReferralCount, 0);
  assert.equal(discount.totalDiscountPercent, 0);
  assert.equal(fixture.state.referrals[0]?.status, ReferralStatus.PENDING);
});

test("getActiveReferralCount joins referrals and subscriptions and filters strictly by ACTIVE", async () => {
  const fixture = createReferralTestFixture();

  await createPendingReferral(
    fixture,
    fixture.ids.customerBId,
    fixture.ids.subscriptionBId,
  );
  await createPendingReferral(
    fixture,
    fixture.ids.customerCId,
    fixture.ids.subscriptionCId,
  );
  await createPendingReferral(
    fixture,
    fixture.ids.customerDId,
    fixture.ids.subscriptionDId,
  );

  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionBId },
    data: { status: SubscriptionStatus.ACTIVE },
  });
  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionCId },
    data: { status: SubscriptionStatus.ACTIVE },
  });
  await fixture.db.subscription.update({
    where: { id: fixture.ids.subscriptionDId },
    data: { status: SubscriptionStatus.PAST_DUE },
  });

  await fixture.db.referral.update({
    where: { id: fixture.state.referrals[0]!.id },
    data: { status: ReferralStatus.ACTIVE },
  });
  await fixture.db.referral.update({
    where: { id: fixture.state.referrals[1]!.id },
    data: { status: ReferralStatus.PENDING },
  });
  await fixture.db.referral.update({
    where: { id: fixture.state.referrals[2]!.id },
    data: { status: ReferralStatus.ACTIVE },
  });

  const activeCount = await getActiveReferralCount(
    fixture.ids.customerAId,
    fixture.db as never,
  );

  assert.equal(activeCount, 1);
});

test("validation blocks destructive edge values", async () => {
  assert.throws(
    () =>
      validateReferralProgramConfiguration({
        referralPercent: 101,
        maxDiscountPercent: 10,
        basePriceCents: 25_000,
        minPriceCents: 20_000,
      }),
    /Referral percent must be between 0 and 100/,
  );

  assert.throws(
    () =>
      validateReferralProgramConfiguration({
        referralPercent: 5,
        maxDiscountPercent: 101,
        basePriceCents: 25_000,
        minPriceCents: 20_000,
      }),
    /Max discount percent must be between 0 and 100/,
  );

  assert.throws(
    () =>
      validateReferralProgramConfiguration({
        referralPercent: 5,
        maxDiscountPercent: 10,
        basePriceCents: 25_000,
        minPriceCents: 30_000,
      }),
    /Minimum price cents cannot exceed the plan base price/,
  );

  assert.throws(
    () =>
      planSchema.parse({
        name: "Pro",
        slug: "pro",
        description: "A valid enough plan description.",
        priceCents: 25_000,
        referralPercentOverride: 150,
        maxDiscountPercent: 20,
        minPriceCents: 26_000,
      }),
    /100|Minimum price cannot exceed the base plan price/,
  );
});


