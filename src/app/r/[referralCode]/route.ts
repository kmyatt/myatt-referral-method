import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { REFERRAL_COOKIE_NAME } from "@/lib/constants";
import { findBusinessByReferralCode } from "@/lib/dashboard-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ referralCode: string }> },
) {
  const { referralCode } = await context.params;
  const business = await findBusinessByReferralCode(referralCode);

  if (!business) {
    redirect("/");
  }

  const cookieStore = await cookies();
  cookieStore.set(REFERRAL_COOKIE_NAME, referralCode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(`/subscribe/${business.slug}`);
}
