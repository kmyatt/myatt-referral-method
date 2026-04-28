import { BusinessUserRole } from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log-service";
import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership } from "@/lib/permissions";
import { planSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const membership = await requireBusinessMembership(undefined, BusinessUserRole.BUSINESS_OWNER);
    const body = planSchema.parse(await request.json());

    const plan = await prisma.subscriptionPlan.create({
      data: {
        businessId: membership.businessId,
        name: body.name,
        slug: body.slug,
        description: body.description,
        priceCents: body.priceCents,
        referralPercentOverride: body.referralPercentOverride,
        maxDiscountPercent: body.maxDiscountPercent,
        minPriceCents: body.minPriceCents,
      } as never,
    });

    await createAuditLog({
      businessId: membership.businessId,
      actorUserId: membership.businessId,
      actorType: "PLATFORM_USER",
      action: "plan.created",
      targetType: "SubscriptionPlan",
      targetId: plan.id,
    });

    return Response.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}
