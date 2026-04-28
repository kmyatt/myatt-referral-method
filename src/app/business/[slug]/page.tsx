import Link from "next/link";

import { getPublicBusinessPageData } from "@/lib/dashboard-data";
import { formatCurrency, formatPercent } from "@/lib/money";
import { ActionLink, AppLogo, Card } from "@/ui";

export default async function BusinessPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = await getPublicBusinessPageData(slug);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-[2rem] border border-[var(--line)] bg-[rgba(255,255,255,0.84)] p-6 shadow-xl shadow-slate-950/5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <AppLogo />
          <Link href={`/subscribe/${business.slug}`} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Subscribe</Link>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="eyebrow">Merchant page</p>
            <h1 className="mt-3 text-5xl font-semibold tracking-[-0.07em] text-slate-950">{business.name}</h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--muted)]">{business.description}</p>
          </div>
          <Card>
            <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Referral economics</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">Subscribers get ongoing discounts while their referred subscribers remain active. The default business referral rate is currently {formatPercent(Number(business.defaultReferralPercent))}.</p>
          </Card>
        </div>
      </header>
      <section className="grid gap-4 lg:grid-cols-3">
        {business.plans.map((plan) => (
          <Card key={plan.id}>
            <p className="eyebrow">Plan</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{plan.name}</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{plan.description}</p>
            <p className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-slate-950">{formatCurrency(plan.priceCents)}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">{plan.referralPercentOverride ? `Uses ${formatPercent(Number(plan.referralPercentOverride))} referral credit per active referral.` : `Uses the business default of ${formatPercent(Number(business.defaultReferralPercent))} per active referral.`}</p>
            <div className="mt-6">
              <ActionLink href={`/subscribe/${business.slug}`}>Choose {plan.name}</ActionLink>
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
