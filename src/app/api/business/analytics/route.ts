import { getBusinessAnalytics } from "@/lib/analytics-service";
import { apiError } from "@/lib/http";
import { requireCurrentBusinessId } from "@/lib/request-context";

export async function GET(request: Request) {
  try {
    const businessId = await requireCurrentBusinessId(request);
    return Response.json(await getBusinessAnalytics(businessId));
  } catch (error) {
    return apiError(error, 401);
  }
}

