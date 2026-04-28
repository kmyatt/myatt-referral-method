import { requirePlatformAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const webhookEvents = await prisma.webhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      include: { business: true },
      take: 100,
    });
    return Response.json({ webhookEvents });
  } catch (error) {
    return apiError(error, 401);
  }
}

