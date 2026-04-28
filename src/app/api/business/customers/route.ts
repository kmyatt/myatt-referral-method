import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireCurrentBusinessId } from "@/lib/request-context";

export async function GET(request: Request) {
  try {
    const businessId = await requireCurrentBusinessId(request);
    const customers = await prisma.customer.findMany({
      where: { businessId, deletedAt: null },
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ customers });
  } catch (error) {
    return apiError(error, 401);
  }
}

