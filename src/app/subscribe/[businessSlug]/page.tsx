import { cookies } from "next/headers";

import { CheckoutForm } from "@/client-forms";
import { REFERRAL_COOKIE_NAME } from "@/lib/constants";
import { getPublicBusinessPageData } from "@/lib/dashboard-data";
import { formatCurrency } from "@/lib/money";
import { AppLogo, Card } from "@/ui";

export default async function SubscribePage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const business = await getPublicBusinessPageData(businessSlug);
  const referralCode = (await cookies()).get(REFERRAL_COOKIE_NAME)?.value ?? "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <AppLogo />
          <h1 className="text-4xl font-semibold tracking-[-0.06em] text-slate-950">Subscribe to {business.name}</h1>
          <p className="text-base leading-7 text-[var(--muted)]">Create your subscriber account, select a plan, and optionally apply a referral code now. The referrer only keeps the discount while your subscription remains active.</p>
          <div className="space-y-3 rounded-[1.5rem] border border-[var(--line)] bg-white p-4 text-sm leading-7 text-[var(--muted)]">
            {business.plans.map((plan) => (
              <div key={plan.id} className="flex items-center justify-between gap-4">
                <span>{plan.name}</span>
                <span className="font-semibold text-slate-950">{formatCurrency(plan.priceCents)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CheckoutForm
            businessSlug={business.slug}
            referralCode={referralCode}
            planOptions={business.plans.map((plan) => ({ id: plan.id, label: `${plan.name} - ${formatCurrency(plan.priceCents)}` }))}
          />
        </Card>
      </div>
    </main>
  );
}
