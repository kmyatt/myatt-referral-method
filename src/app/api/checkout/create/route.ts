import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import { createSession } from "@/lib/auth";
import { handleSubscriptionStatusChange } from "@/lib/billing-service";
import { createReferralRelationship } from "@/lib/referral-service";
import { createStripeCheckoutSession } from "@/lib/stripe-service";
import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { checkoutCreateSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const body = checkoutCreateSchema.parse(await request.json());
    const business = await prisma.business.findUniqueOrThrow({
      where: { slug: body.businessSlug },
    });
    const plan = await prisma.subscriptionPlan.findFirstOrThrow({
      where: { id: body.planId, businessId: business.id, deletedAt: null },
    });

    let user = await prisma.platformUser.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (user) {
      const passwordMatches = await bcrypt.compare(body.password, user.passwordHash);
      if (!passwordMatches) {
        return Response.json(
          { error: "An account with that email already exists. Please sign in instead." },
          { status: 409 },
        );
      }
    } else {
      user = await prisma.platformUser.create({
        data: {
          email: body.email.toLowerCase(),
          firstName: body.firstName,
          lastName: body.lastName,
          passwordHash: await bcrypt.hash(body.password, 10),
        },
      });
    }

    const customer = await prisma.customer.upsert({
      where: {
        businessId_email: {
          businessId: business.id,
          email: body.email.toLowerCase(),
        },
      },
      update: {
        firstName: body.firstName,
        lastName: body.lastName,
        platformUserId: user.id,
        status: "ACTIVE",
      },
      create: {
        businessId: business.id,
        platformUserId: user.id,
        email: body.email.toLowerCase(),
        firstName: body.firstName,
        lastName: body.lastName,
        status: "ACTIVE",
        referralCode: `MRM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      },
    });

    let subscription = await prisma.subscription.findFirst({
      where: {
        businessId: business.id,
        customerId: customer.id,
        planId: plan.id,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription) {
      subscription = await prisma.subscription.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          planId: plan.id,
          status: "INCOMPLETE",
          basePriceCents: plan.priceCents,
          effectivePriceCents: plan.priceCents,
        },
      });
    }

    if (body.referralCode) {
      const referrer = await prisma.customer.findUnique({
        where: { referralCode: body.referralCode },
      });

      if (referrer && referrer.businessId === business.id) {
        await createReferralRelationship({
          businessId: business.id,
          referrerCustomerId: referrer.id,
          referredCustomerId: customer.id,
          referralCodeUsed: body.referralCode,
          referredSubscriptionId: subscription.id,
        });
      }
    }

    await createSession(user.id, {
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    if (!business.stripeCheckoutEnabled || !plan.stripePriceId) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        },
      });
      await handleSubscriptionStatusChange(subscription.id);
      return Response.json({ url: "/dashboard/customer" });
    }

    const session = await createStripeCheckoutSession({
      businessId: business.id,
      businessSlug: business.slug,
      businessName: business.name,
      planId: plan.id,
      stripePriceId: plan.stripePriceId,
      customerEmail: customer.email,
      customerId: customer.id,
      referralCode: body.referralCode,
    });

    return Response.json(session);
  } catch (error) {
    return apiError(error);
  }
}

