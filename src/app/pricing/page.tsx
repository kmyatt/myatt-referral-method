import Link from "next/link";

import { ActionLink, AppLogo, Card, PageSection, SecondaryLink } from "@/ui";

export default function PricingPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-[var(--line)] bg-[rgba(255,255,255,0.84)] p-6 shadow-xl shadow-slate-950/5">
        <AppLogo />
        <div className="flex gap-3">
          <Link href="/" className="rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white">Home</Link>
          <ActionLink href="/signup">Get started</ActionLink>
        </div>
      </header>

      <PageSection
        eyebrow="MVP structure"
        title="A production-minded SaaS foundation"
        description="The MVP is designed for real businesses: one app, many merchants, a shared platform admin layer, tenant isolation, Stripe integration, and a referral math service that recalculates discounts from active subscription state."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <h3 className="text-xl font-semibold">Starter launch</h3>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.06em]">$0 now</p>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">Run locally with Stripe test mode, PostgreSQL, seeded data, and the full dashboard surface to validate business workflows.</p>
          </Card>
          <Card>
            <h3 className="text-xl font-semibold">Business engine</h3>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted)]">
              <li>Hosted subscription checkout</li>
              <li>Per-business and per-plan referral percentages</li>
              <li>Automatic referral activation and deactivation</li>
              <li>Discount history through billing events</li>
            </ul>
          </Card>
          <Card>
            <h3 className="text-xl font-semibold">Platform controls</h3>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--muted)]">
              <li>Platform MRR and subscription volume</li>
              <li>Webhook event monitoring</li>
              <li>Business performance leaderboard</li>
              <li>Audit log coverage for critical mutations</li>
            </ul>
          </Card>
        </div>
      </PageSection>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Next step</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Launch your own referral-backed subscription program.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <ActionLink href="/signup">Create an account</ActionLink>
          <SecondaryLink href="/login">Sign in</SecondaryLink>
        </div>
      </Card>
    </main>
  );
}

