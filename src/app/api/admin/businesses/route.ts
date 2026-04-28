import { requirePlatformAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const businesses = await prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customers: true,
        subscriptions: true,
      },
    });
    return Response.json({ businesses });
  } catch (error) {
    return apiError(error, 401);
  }
}

