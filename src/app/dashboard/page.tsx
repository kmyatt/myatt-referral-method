import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

export default async function DashboardIndexPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.globalRole === "PLATFORM_ADMIN") {
    redirect("/dashboard/admin");
  }

  if (user.businessMemberships.length > 0) {
    redirect("/dashboard/business");
  }

  if (user.customerProfiles.length > 0) {
    redirect("/dashboard/customer");
  }

  redirect("/dashboard/onboarding");
}

