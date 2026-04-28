import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireCurrentBusinessId } from "@/lib/request-context";

export async function GET(request: Request) {
  try {
    const businessId = await requireCurrentBusinessId(request);
    const referrals = await prisma.referral.findMany({
      where: { businessId },
      include: {
        referrerCustomer: true,
        referredCustomer: true,
        referredSubscription: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ referrals });
  } catch (error) {
    return apiError(error, 401);
  }
}

