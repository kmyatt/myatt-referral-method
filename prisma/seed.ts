import bcrypt from "bcryptjs";
import {
  BusinessUserRole,
  GlobalRole,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";

import { handleSubscriptionStatusChange } from "../src/lib/billing-service";

const prisma = new PrismaClient();

function code(prefix: string) {
  return `MRM-${prefix.toUpperCase()}`;
}

async function main() {
  const passwordHash = await bcrypt.hash("Password123", 10);

  const admin = await prisma.platformUser.upsert({
    where: { email: "admin@myatt.test" },
    update: {
      firstName: "Avery",
      lastName: "Admin",
      globalRole: GlobalRole.PLATFORM_ADMIN,
      passwordHash,
    },
    create: {
      email: "admin@myatt.test",
      firstName: "Avery",
      lastName: "Admin",
      globalRole: GlobalRole.PLATFORM_ADMIN,
      passwordHash,
    },
  });

  const owner = await prisma.platformUser.upsert({
    where: { email: "owner@fitstream.test" },
    update: {
      firstName: "Morgan",
      lastName: "Myatt",
      passwordHash,
    },
    create: {
      email: "owner@fitstream.test",
      firstName: "Morgan",
      lastName: "Myatt",
      passwordHash,
    },
  });

  const staff = await prisma.platformUser.upsert({
    where: { email: "staff@fitstream.test" },
    update: {
      firstName: "Jamie",
      lastName: "Staff",
      passwordHash,
    },
    create: {
      email: "staff@fitstream.test",
      firstName: "Jamie",
      lastName: "Staff",
      passwordHash,
    },
  });

  const secondOwner = await prisma.platformUser.upsert({
    where: { email: "owner@steadyhq.test" },
    update: {
      firstName: "Quinn",
      lastName: "Builder",
      passwordHash,
    },
    create: {
      email: "owner@steadyhq.test",
      firstName: "Quinn",
      lastName: "Builder",
      passwordHash,
    },
  });

  const fitstream = await prisma.business.upsert({
    where: { slug: "fitstream-plus" },
    update: {
      ownerUserId: owner.id,
      name: "FitStream Plus",
      description: "Premium coaching memberships powered by recurring referral discounts.",
      status: "ACTIVE",
      stripeCheckoutEnabled: false,
      defaultReferralPercent: 5,
      maxReferralDiscountPercent: 50,
      supportEmail: "support@fitstream.test",
      onboardingCompletedAt: new Date(),
    },
    create: {
      ownerUserId: owner.id,
      name: "FitStream Plus",
      slug: "fitstream-plus",
      description: "Premium coaching memberships powered by recurring referral discounts.",
      status: "ACTIVE",
      stripeCheckoutEnabled: false,
      defaultReferralPercent: 5,
      maxReferralDiscountPercent: 50,
      supportEmail: "support@fitstream.test",
      onboardingCompletedAt: new Date(),
    },
  });

  const steady = await prisma.business.upsert({
    where: { slug: "steady-hq" },
    update: {
      ownerUserId: secondOwner.id,
      name: "Steady HQ",
      description: "Finance membership platform using business-level referral discounts.",
      status: "ACTIVE",
      stripeCheckoutEnabled: false,
      defaultReferralPercent: 8,
      maxReferralDiscountPercent: 40,
      supportEmail: "hello@steadyhq.test",
      onboardingCompletedAt: new Date(),
    },
    create: {
      ownerUserId: secondOwner.id,
      name: "Steady HQ",
      slug: "steady-hq",
      description: "Finance membership platform using business-level referral discounts.",
      status: "ACTIVE",
      stripeCheckoutEnabled: false,
      defaultReferralPercent: 8,
      maxReferralDiscountPercent: 40,
      supportEmail: "hello@steadyhq.test",
      onboardingCompletedAt: new Date(),
    },
  });

  await prisma.businessUser.upsert({
    where: { businessId_userId: { businessId: fitstream.id, userId: owner.id } },
    update: { role: BusinessUserRole.BUSINESS_OWNER, isActive: true },
    create: {
      businessId: fitstream.id,
      userId: owner.id,
      role: BusinessUserRole.BUSINESS_OWNER,
      title: "Founder",
    },
  });

  await prisma.businessUser.upsert({
    where: { businessId_userId: { businessId: fitstream.id, userId: staff.id } },
    update: { role: BusinessUserRole.BUSINESS_STAFF, isActive: true },
    create: {
      businessId: fitstream.id,
      userId: staff.id,
      role: BusinessUserRole.BUSINESS_STAFF,
      title: "Operations",
    },
  });

  await prisma.businessUser.upsert({
    where: { businessId_userId: { businessId: steady.id, userId: secondOwner.id } },
    update: { role: BusinessUserRole.BUSINESS_OWNER, isActive: true },
    create: {
      businessId: steady.id,
      userId: secondOwner.id,
      role: BusinessUserRole.BUSINESS_OWNER,
      title: "Founder",
    },
  });

  await prisma.referralDiscountRule.createMany({
    data: [
      {
        businessId: fitstream.id,
        name: "FitStream default",
        referralPercent: 5,
        maxDiscountPercent: 50,
      },
      {
        businessId: steady.id,
        name: "Steady default",
        referralPercent: 8,
        maxDiscountPercent: 40,
      },
    ],
    skipDuplicates: true,
  });

  const fitstreamCore = await prisma.subscriptionPlan.upsert({
    where: { businessId_slug: { businessId: fitstream.id, slug: "core" } },
    update: {
      name: "Core",
      description: "Monthly coaching membership with live classes and referral discounts.",
      priceCents: 25000,
      referralPercentOverride: 5,
      stripePriceId: "price_fitstream_core",
    },
    create: {
      businessId: fitstream.id,
      name: "Core",
      slug: "core",
      description: "Monthly coaching membership with live classes and referral discounts.",
      priceCents: 25000,
      referralPercentOverride: 5,
      stripePriceId: "price_fitstream_core",
      sortOrder: 1,
    },
  });

  const fitstreamElite = await prisma.subscriptionPlan.upsert({
    where: { businessId_slug: { businessId: fitstream.id, slug: "elite" } },
    update: {
      name: "Elite",
      description: "Higher-touch coaching membership with a stronger referral rate.",
      priceCents: 40000,
      referralPercentOverride: 6,
      stripePriceId: "price_fitstream_elite",
    },
    create: {
      businessId: fitstream.id,
      name: "Elite",
      slug: "elite",
      description: "Higher-touch coaching membership with a stronger referral rate.",
      priceCents: 40000,
      referralPercentOverride: 6,
      stripePriceId: "price_fitstream_elite",
      sortOrder: 2,
    },
  });

  const steadyStarter = await prisma.subscriptionPlan.upsert({
    where: { businessId_slug: { businessId: steady.id, slug: "starter" } },
    update: {
      name: "Starter",
      description: "Business finance membership for founders.",
      priceCents: 18000,
      referralPercentOverride: 8,
      stripePriceId: "price_steady_starter",
    },
    create: {
      businessId: steady.id,
      name: "Starter",
      slug: "starter",
      description: "Business finance membership for founders.",
      priceCents: 18000,
      referralPercentOverride: 8,
      stripePriceId: "price_steady_starter",
      sortOrder: 1,
    },
  });

  const subscriberUsers = await Promise.all(
    [
      ["alice@fitstream.test", "Alice", "Nguyen"],
      ["ben@fitstream.test", "Ben", "Ortiz"],
      ["cara@fitstream.test", "Cara", "Lee"],
      ["drew@fitstream.test", "Drew", "Patel"],
      ["erin@fitstream.test", "Erin", "Stone"],
      ["frank@steadyhq.test", "Frank", "Miles"],
      ["grace@steadyhq.test", "Grace", "Hill"],
    ].map(async ([email, firstName, lastName]) =>
      prisma.platformUser.upsert({
        where: { email },
        update: { firstName, lastName, passwordHash },
        create: { email, firstName, lastName, passwordHash },
      }),
    ),
  );

  const [aliceUser, benUser, caraUser, drewUser, erinUser, frankUser, graceUser] = subscriberUsers;

  const alice = await prisma.customer.upsert({
    where: { businessId_email: { businessId: fitstream.id, email: aliceUser.email } },
    update: { platformUserId: aliceUser.id, referralCode: code("alice") },
    create: {
      businessId: fitstream.id,
      platformUserId: aliceUser.id,
      email: aliceUser.email,
      firstName: "Alice",
      lastName: "Nguyen",
      referralCode: code("alice"),
      status: "ACTIVE",
    },
  });

  const ben = await prisma.customer.upsert({
    where: { businessId_email: { businessId: fitstream.id, email: benUser.email } },
    update: { platformUserId: benUser.id, referralCode: code("ben") },
    create: {
      businessId: fitstream.id,
      platformUserId: benUser.id,
      email: benUser.email,
      firstName: "Ben",
      lastName: "Ortiz",
      referralCode: code("ben"),
      status: "ACTIVE",
    },
  });

  const cara = await prisma.customer.upsert({
    where: { businessId_email: { businessId: fitstream.id, email: caraUser.email } },
    update: { platformUserId: caraUser.id, referralCode: code("cara") },
    create: {
      businessId: fitstream.id,
      platformUserId: caraUser.id,
      email: caraUser.email,
      firstName: "Cara",
      lastName: "Lee",
      referralCode: code("cara"),
      status: "INACTIVE",
    },
  });

  const drew = await prisma.customer.upsert({
    where: { businessId_email: { businessId: fitstream.id, email: drewUser.email } },
    update: { platformUserId: drewUser.id, referralCode: code("drew") },
    create: {
      businessId: fitstream.id,
      platformUserId: drewUser.id,
      email: drewUser.email,
      firstName: "Drew",
      lastName: "Patel",
      referralCode: code("drew"),
      status: "ACTIVE",
    },
  });

  const erin = await prisma.customer.upsert({
    where: { businessId_email: { businessId: fitstream.id, email: erinUser.email } },
    update: { platformUserId: erinUser.id, referralCode: code("erin") },
    create: {
      businessId: fitstream.id,
      platformUserId: erinUser.id,
      email: erinUser.email,
      firstName: "Erin",
      lastName: "Stone",
      referralCode: code("erin"),
      status: "ACTIVE",
    },
  });

  const frank = await prisma.customer.upsert({
    where: { businessId_email: { businessId: steady.id, email: frankUser.email } },
    update: { platformUserId: frankUser.id, referralCode: code("frank") },
    create: {
      businessId: steady.id,
      platformUserId: frankUser.id,
      email: frankUser.email,
      firstName: "Frank",
      lastName: "Miles",
      referralCode: code("frank"),
      status: "ACTIVE",
    },
  });

  const grace = await prisma.customer.upsert({
    where: { businessId_email: { businessId: steady.id, email: graceUser.email } },
    update: { platformUserId: graceUser.id, referralCode: code("grace") },
    create: {
      businessId: steady.id,
      platformUserId: graceUser.id,
      email: graceUser.email,
      firstName: "Grace",
      lastName: "Hill",
      referralCode: code("grace"),
      status: "ACTIVE",
    },
  });

  const subscriptions = {
    alice: await prisma.subscription.upsert({
      where: { stripeSubscriptionId: "sub_fitstream_alice" },
      update: { status: SubscriptionStatus.ACTIVE, basePriceCents: 25000, effectivePriceCents: 25000, planId: fitstreamCore.id },
      create: {
        businessId: fitstream.id,
        customerId: alice.id,
        planId: fitstreamCore.id,
        stripeCustomerId: "cus_fitstream_alice",
        stripeSubscriptionId: "sub_fitstream_alice",
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        basePriceCents: 25000,
        effectivePriceCents: 25000,
      },
    }),
    ben: await prisma.subscription.upsert({
      where: { stripeSubscriptionId: "sub_fitstream_ben" },
      update: { status: SubscriptionStatus.ACTIVE, basePriceCents: 25000, effectivePriceCents: 25000, planId: fitstreamCore.id },
      create: {
        businessId: fitstream.id,
        customerId: ben.id,
        planId: fitstreamCore.id,
        stripeCustomerId: "cus_fitstream_ben",
        stripeSubscriptionId: "sub_fitstream_ben",
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        basePriceCents: 25000,
        effectivePriceCents: 25000,
      },
    }),
    cara: await prisma.subscription.upsert({
      where: { stripeSubscriptionId: "sub_fitstream_cara" },
      update: { status: SubscriptionStatus.CANCELED, basePriceCents: 25000, effectivePriceCents: 25000, planId: fitstreamCore.id },
      create: {
        businessId: fitstream.id,
        customerId: cara.id,
        planId: fitstreamCore.id,
        stripeCustomerId: "cus_fitstream_cara",
        stripeSubscriptionId: "sub_fitstream_cara",
        status: SubscriptionStatus.CANCELED,
        currentPeriodStart: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40),
        currentPeriodEnd: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
        basePriceCents: 25000,
        effectivePriceCents: 25000,
        canceledAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8),
      },
    }),
    drew: await prisma.subscription.upsert({
      where: { stripeSubscriptionId: "sub_fitstream_drew" },
      update: { status: SubscriptionStatus.ACTIVE, basePriceCents: 40000, effectivePriceCents: 40000, planId: fitstreamElite.id },
      create: {
        businessId: fitstream.id,
        customerId: drew.id,
        planId: fitstreamElite.id,
        stripeCustomerId: "cus_fitstream_drew",
        stripeSubscriptionId: "sub_fitstream_drew",
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        basePriceCents: 40000,
        effectivePriceCents: 40000,
      },
    }),
    erin: await prisma.subscription.upsert({
      where: { stripeSubscriptionId: "sub_fitstream_erin" },
      update: { status: SubscriptionStatus.ACTIVE, basePriceCents: 25000, effectivePriceCents: 25000, planId: fitstreamCore.id },
      create: {
        businessId: fitstream.id,
        customerId: erin.id,
        planId: fitstreamCore.id,
        stripeCustomerId: "cus_fitstream_erin",
        stripeSubscriptionId: "sub_fitstream_erin",
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        basePriceCents: 25000,
        effectivePriceCents: 25000,
      },
    }),
    frank: await prisma.subscription.upsert({
      where: { stripeSubscriptionId: "sub_steady_frank" },
      update: { status: SubscriptionStatus.ACTIVE, basePriceCents: 18000, effectivePriceCents: 18000, planId: steadyStarter.id },
      create: {
        businessId: steady.id,
        customerId: frank.id,
        planId: steadyStarter.id,
        stripeCustomerId: "cus_steady_frank",
        stripeSubscriptionId: "sub_steady_frank",
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        basePriceCents: 18000,
        effectivePriceCents: 18000,
      },
    }),
    grace: await prisma.subscription.upsert({
      where: { stripeSubscriptionId: "sub_steady_grace" },
      update: { status: SubscriptionStatus.ACTIVE, basePriceCents: 18000, effectivePriceCents: 18000, planId: steadyStarter.id },
      create: {
        businessId: steady.id,
        customerId: grace.id,
        planId: steadyStarter.id,
        stripeCustomerId: "cus_steady_grace",
        stripeSubscriptionId: "sub_steady_grace",
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        basePriceCents: 18000,
        effectivePriceCents: 18000,
      },
    }),
  };

  await prisma.referral.upsert({
    where: { referredCustomerId: ben.id },
    update: {
      businessId: fitstream.id,
      referrerCustomerId: alice.id,
      referredSubscriptionId: subscriptions.ben.id,
      referralCodeUsed: alice.referralCode,
      discountPercentAtCreation: 5,
      status: "ACTIVE",
      activatedAt: new Date(),
      deactivatedAt: null,
    },
    create: {
      businessId: fitstream.id,
      referrerCustomerId: alice.id,
      referredCustomerId: ben.id,
      referredSubscriptionId: subscriptions.ben.id,
      referralCodeUsed: alice.referralCode,
      discountPercentAtCreation: 5,
      status: "ACTIVE",
      activatedAt: new Date(),
    },
  });

  await prisma.referral.upsert({
    where: { referredCustomerId: cara.id },
    update: {
      businessId: fitstream.id,
      referrerCustomerId: alice.id,
      referredSubscriptionId: subscriptions.cara.id,
      referralCodeUsed: alice.referralCode,
      discountPercentAtCreation: 5,
      status: "INACTIVE",
      activatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
      deactivatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8),
    },
    create: {
      businessId: fitstream.id,
      referrerCustomerId: alice.id,
      referredCustomerId: cara.id,
      referredSubscriptionId: subscriptions.cara.id,
      referralCodeUsed: alice.referralCode,
      discountPercentAtCreation: 5,
      status: "INACTIVE",
      activatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
      deactivatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8),
    },
  });

  await prisma.referral.upsert({
    where: { referredCustomerId: grace.id },
    update: {
      businessId: steady.id,
      referrerCustomerId: frank.id,
      referredSubscriptionId: subscriptions.grace.id,
      referralCodeUsed: frank.referralCode,
      discountPercentAtCreation: 8,
      status: "ACTIVE",
      activatedAt: new Date(),
      deactivatedAt: null,
    },
    create: {
      businessId: steady.id,
      referrerCustomerId: frank.id,
      referredCustomerId: grace.id,
      referredSubscriptionId: subscriptions.grace.id,
      referralCodeUsed: frank.referralCode,
      discountPercentAtCreation: 8,
      status: "ACTIVE",
      activatedAt: new Date(),
    },
  });

  await handleSubscriptionStatusChange(subscriptions.alice.id);
  await handleSubscriptionStatusChange(subscriptions.ben.id);
  await handleSubscriptionStatusChange(subscriptions.cara.id);
  await handleSubscriptionStatusChange(subscriptions.frank.id);
  await handleSubscriptionStatusChange(subscriptions.grace.id);

  await prisma.webhookEvent.upsert({
    where: { eventId: "evt_seed_checkout_completed" },
    update: {
      type: "checkout.session.completed",
      status: "PROCESSED",
      payload: { source: "seed" },
      processedAt: new Date(),
    },
    create: {
      businessId: fitstream.id,
      eventId: "evt_seed_checkout_completed",
      type: "checkout.session.completed",
      status: "PROCESSED",
      payload: { source: "seed" },
      processedAt: new Date(),
    },
  });

  console.log(`Seeded users: ${[admin.email, owner.email, staff.email].join(", ")}`);
  console.log("Use Password123 for all seeded accounts.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
