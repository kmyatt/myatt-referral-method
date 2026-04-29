import { LogoutButton } from "@/client-forms";
import { businessNav } from "@/dashboard-nav";
import { getBusinessDashboardData } from "@/lib/dashboard-data";
import { decimalToNumber, formatCurrency, formatPercent } from "@/lib/money";
import { requireBusinessMembership } from "@/lib/permissions";
import { Badge, Card, DashboardShell, DataTable, MiniBarChart, StatCard } from "@/ui";

export default async function BusinessOverviewPage() {
  const membership = await requireBusinessMembership();
  const dashboard = await getBusinessDashboardData(membership.businessId);

  return (
    <DashboardShell
      title={`${dashboard.business.name} dashboard`}
      subtitle="Track the financial impact of referral-powered subscription growth across subscribers, referred conversions, live discounts, and churn."
      nav={businessNav("/dashboard/business")}
      actions={<LogoutButton />}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross MRR" value={formatCurrency(dashboard.metrics.grossMrr)} hint="Base recurring revenue before discounts." />
        <StatCard label="Net MRR" value={formatCurrency(dashboard.metrics.netMrr)} hint="Effective recurring revenue after referral discounts." />
        <StatCard label="Active referrals" value={String(dashboard.metrics.activeReferrals)} hint="Only active referred subscriptions count." />
        <StatCard label="Discounts issued" value={formatCurrency(dashboard.metrics.totalActiveReferralDiscounts)} hint="Recurring monthly value transferred into customer discounts." />
      </section>
      <MiniBarChart data={dashboard.monthlyTrend.map((entry) => ({ label: entry.label, value: entry.referrals }))} />
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Topline metrics</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Active subscribers</p>
              <p className="mt-2 text-2xl font-semibold">{dashboard.metrics.activeSubscribers}</p>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Referral conversion rate</p>
              <p className="mt-2 text-2xl font-semibold">{formatPercent(dashboard.metrics.referralConversionRate)}</p>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Churn rate</p>
              <p className="mt-2 text-2xl font-semibold">{formatPercent(dashboard.metrics.churnRate)}</p>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Avg referrals / subscriber</p>
              <p className="mt-2 text-2xl font-semibold">{dashboard.metrics.averageReferralsPerSubscriber.toFixed(2)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Recent billing events</h2>
          <div className="mt-5 space-y-3">
            {dashboard.recentEvents.map((event) => (
              <div key={event.id} className="rounded-[1.3rem] border border-[var(--line)] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{event.type.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{new Date(event.occurredAt).toLocaleString()}</p>
                  </div>
                  <Badge tone={event.status === "FAILED" ? "danger" : "success"}>{event.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
      <Card>
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Recent referral relationships</h2>
        <div className="mt-5">
          <DataTable
            columns={["Referrer", "Referred subscriber", "Status", "Discount at creation"]}
            rows={dashboard.referrals.slice(0, 8).map((referral) => [
              referral.referrerCustomer.email,
              referral.referredCustomer.email,
              <Badge key={referral.id} tone={referral.status === "ACTIVE" ? "success" : referral.status === "PENDING" ? "warning" : "danger"}>{referral.status}</Badge>,
              formatPercent(decimalToNumber(referral.discountPercentAtCreation)),
            ])}
          />
        </div>
      </Card>
    </DashboardShell>
  );
}
