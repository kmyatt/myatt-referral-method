import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership } from "@/lib/permissions";
import { planSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const membership = await requireBusinessMembership();
    const body = planSchema.parse(await request.json());
    const { id } = await context.params;

    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        priceCents: body.priceCents,
        referralPercentOverride: body.referralPercentOverride,
        maxDiscountPercent: body.maxDiscountPercent,
        minPriceCents: body.minPriceCents,
      } as never,
    });

    return Response.json({ plan, businessId: membership.businessId });
  } catch (error) {
    return apiError(error);
  }
}
