import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const referrals = await prisma.referral.findMany({
      where: { referrerCustomerId: id },
      include: {
        referredCustomer: true,
        referredSubscription: true,
      },
    });
    return Response.json({ referrals });
  } catch (error) {
    return apiError(error, 404);
  }
}
