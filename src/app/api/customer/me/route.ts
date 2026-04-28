import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ user });
  } catch (error) {
    return apiError(error, 401);
  }
}

