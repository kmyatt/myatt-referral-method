import { calculateCustomerReferralDiscount } from "@/lib/referral-service";
import { apiError } from "@/lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return Response.json(await calculateCustomerReferralDiscount(id));
  } catch (error) {
    return apiError(error, 404);
  }
}
