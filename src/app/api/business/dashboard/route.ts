import { getBusinessDashboardData } from "@/lib/dashboard-data";
import { apiError } from "@/lib/http";
import { requireCurrentBusinessId } from "@/lib/request-context";

export async function GET(request: Request) {
  try {
    const businessId = await requireCurrentBusinessId(request);
    const dashboard = await getBusinessDashboardData(businessId);
    return Response.json(dashboard);
  } catch (error) {
    return apiError(error, 401);
  }
}

