import { BusinessUserRole } from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log-service";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { businessOnboardingSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = businessOnboardingSchema.parse(await request.json());
    const slug = slugify(body.businessSlug || body.businessName);

    const existing = await prisma.business.findUnique({ where: { slug } });
    if (existing) {
      return Response.json({ error: "That business slug is already taken." }, { status: 409 });
    }

    const business = await prisma.business.create({
      data: {
        ownerUserId: user.id,
        name: body.businessName,
        slug,
        description: body.description,
        supportEmail: body.supportEmail,
        websiteUrl: body.websiteUrl || null,
        status: "ACTIVE",
        stripeCheckoutEnabled: false,
        defaultReferralPercent: body.defaultReferralPercent,
        maxReferralDiscountPercent: body.maxReferralDiscountPercent,
        onboardingCompletedAt: new Date(),
        users: {
          create: {
            userId: user.id,
            role: BusinessUserRole.BUSINESS_OWNER,
            title: "Owner",
          },
        },
        referralDiscountRules: {
          create: {
            name: "Business default",
            referralPercent: body.defaultReferralPercent,
            maxDiscountPercent: body.maxReferralDiscountPercent,
            isActive: true,
          },
        },
      },
    });

    await createAuditLog({
      businessId: business.id,
      actorUserId: user.id,
      actorType: "PLATFORM_USER",
      action: "business.created",
      targetType: "Business",
      targetId: business.id,
      metadata: { slug },
    });

    return Response.json({ ok: true, business });
  } catch (error) {
    return apiError(error);
  }
}

