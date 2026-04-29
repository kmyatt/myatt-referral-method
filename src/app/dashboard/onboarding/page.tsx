import { redirect } from "next/navigation";

import { BusinessOnboardingForm, LogoutButton } from "@/client-forms";
import { requireUser } from "@/lib/auth";
import { AppLogo, Card } from "@/ui";

export default async function OnboardingPage() {
  const user = await requireUser();

  if (user.businessMemberships.length > 0) {
    redirect("/dashboard/business");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <AppLogo />
            <LogoutButton />
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.06em] text-slate-950">Set up your business account.</h1>
          <p className="text-base leading-7 text-[var(--muted)]">Create the merchant shell, define your base referral economics, and unlock the hosted subscription pages and dashboards.</p>
        </Card>
        <Card>
          <BusinessOnboardingForm />
        </Card>
      </div>
    </main>
  );
}
