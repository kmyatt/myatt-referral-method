import { requireCurrentCustomerId } from "@/lib/request-context";
import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const customerId = await requireCurrentCustomerId();
    const subscription = await prisma.subscription.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    });
    return Response.json({ subscription });
  } catch (error) {
    return apiError(error, 401);
  }
}

