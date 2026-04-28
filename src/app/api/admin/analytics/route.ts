import { requirePlatformAdmin } from "@/lib/auth";
import { getPlatformAnalytics } from "@/lib/analytics-service";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json(await getPlatformAnalytics());
  } catch (error) {
    return apiError(error, 401);
  }
}

