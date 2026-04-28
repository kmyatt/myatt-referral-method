import { BusinessUserRole } from "@prisma/client";

import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership } from "@/lib/permissions";
import { referralSettingsSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  try {
    const membership = await requireBusinessMembership(undefined, BusinessUserRole.BUSINESS_OWNER);
    const body = referralSettingsSchema.parse(await request.json());

    const business = await prisma.business.update({
      where: { id: membership.businessId },
      data: {
        referralProgramEnabled: body.referralProgramEnabled,
        defaultReferralPercent: body.defaultReferralPercent,
        maxReferralDiscountPercent: body.maxReferralDiscountPercent,
      },
    });

    await prisma.referralDiscountRule.create({
      data: {
        businessId: business.id,
        name: `Business default ${new Date().toISOString()}`,
        referralPercent: body.defaultReferralPercent,
        maxDiscountPercent: body.maxReferralDiscountPercent,
        isActive: true,
      },
    });

    return Response.json({ business });
  } catch (error) {
    return apiError(error);
  }
}

