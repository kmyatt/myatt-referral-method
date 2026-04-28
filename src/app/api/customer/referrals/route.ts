import { requireCurrentCustomerId } from "@/lib/request-context";
import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const customerId = await requireCurrentCustomerId();
    const referrals = await prisma.referral.findMany({
      where: { referrerCustomerId: customerId },
      include: {
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

