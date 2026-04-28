import Link from "next/link";

import { ActionLink, AppLogo, Card, PageSection, SecondaryLink, StatCard } from "@/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-6 rounded-[2rem] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] p-6 shadow-xl shadow-slate-950/5 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <AppLogo />
          <div className="flex flex-wrap gap-3">
            <Link href="/pricing" className="rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white">
              Pricing
            </Link>
            <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white">
              Log in
            </Link>
            <ActionLink href="/signup">Launch your program</ActionLink>
          </div>
        </div>
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div className="space-y-6">
            <p className="eyebrow">Universal referral billing infrastructure</p>
            <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.08em] text-slate-950 sm:text-6xl lg:text-7xl">
              Let subscribers earn recurring discounts by referring active members.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-[var(--muted)]">
              Myatt Referral Method turns referral growth into a native Stripe-aware subscription model. Every active referred subscriber can reduce the referrer’s own bill automatically, and the discount disappears the moment that referred account becomes inactive.
            </p>
            <div className="flex flex-wrap gap-3">
              <ActionLink href="/signup">Create business account</ActionLink>
              <SecondaryLink href="/pricing">See the MVP architecture</SecondaryLink>
            </div>
          </div>
          <Card className="space-y-4">
            <p className="eyebrow">The core math</p>
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-white p-5 font-mono text-sm leading-7 text-slate-700">
              <p>Subscription = $250 / month</p>
              <p>Referral discount = 5%</p>
              <p>2 active referrals = 10% total discount</p>
              <p>Effective price = $225 / month</p>
            </div>
            <p className="text-sm leading-6 text-[var(--muted)]">
              It’s not affiliate cash payout logic. It’s direct recurring subscription price reduction based on active referred revenue.
            </p>
          </Card>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Multi-tenant" value="4 roles" hint="Platform admin, business owner, staff, and customer." />
        <StatCard label="Billing-aware" value="Stripe sync" hint="Checkout, subscription changes, invoices, and payment failures." />
        <StatCard label="Referral logic" value="Live recalculation" hint="Discounts are recalculated when subscription status changes." />
        <StatCard label="Analytics" value="MRR impact" hint="Track revenue, discounts, referrals, and churn in one place." />
      </section>

      <PageSection
        eyebrow="What businesses get"
        title="A hosted referral growth operating system"
        description="Businesses onboard once, set a default or plan-level referral percentage, and get checkout flows, discount automation, customer dashboards, staff tools, and platform analytics out of the box."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <h3 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Merchant operations</h3>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">Manage plans, customer states, churned referrals, net revenue impact, and Stripe-connected billing from the business dashboard.</p>
          </Card>
          <Card>
            <h3 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Customer experience</h3>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">Every customer gets a referral code, discount visibility, active versus inactive referral history, and a clean subscription dashboard.</p>
          </Card>
          <Card>
            <h3 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Admin visibility</h3>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">Platform admins can see total subscription volume, total discounts created, webhook failures, and business performance rankings.</p>
          </Card>
        </div>
      </PageSection>
    </main>
  );
}

