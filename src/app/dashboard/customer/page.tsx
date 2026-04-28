import { redirect } from "next/navigation";

import { LogoutButton } from "@/client-forms";
import { customerNav } from "@/dashboard-nav";
import { requireUser } from "@/lib/auth";
import { getCustomerDashboardData } from "@/lib/dashboard-data";
import { formatCurrency, formatPercent } from "@/lib/money";
import { Badge, Card, DashboardShell, DataTable, StatCard } from "@/ui";

export default async function CustomerDashboardPage() {
  const user = await requireUser();
  const customerProfile = user.customerProfiles[0];

  if (!customerProfile) {
    redirect("/dashboard/onboarding");
  }

  const dashboard = await getCustomerDashboardData(customerProfile.id);

  return (
    <DashboardShell
      title={`${dashboard.customer.business.name} subscriber dashboard`}
      subtitle="See your active subscription, your referral code, how much discount you’re currently earning, and which referred subscribers are still active."
      nav={customerNav("/dashboard/customer")}
    >
      <div className="flex justify-end">
        <LogoutButton />
      </div>
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Referral code" value={dashboard.customer.referralCode} />
        <StatCard label="Current price" value={dashboard.activeSubscription ? formatCurrency(dashboard.activeSubscription.effectivePriceCents) : "N/A"} />
        <StatCard label="Active referrals" value={String(dashboard.activeReferrals.length)} />
        <StatCard label="Current discount" value={dashboard.activeSubscription ? formatPercent(Number(dashboard.activeSubscription.currentDiscountPercent)) : "0%"} />
      </section>
      <Card>
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Referral link</h2>
        <div className="mt-4 rounded-[1.5rem] border border-[var(--line)] bg-white p-4 font-mono text-sm text-slate-700">
          {`${dashboard.customer.business.slug}/r/${dashboard.customer.referralCode}`}
        </div>
      </Card>
      <Card>
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Active referrals</h2>
        <div className="mt-5">
          <DataTable
            columns={["Subscriber", "Subscription status", "Referral status"]}
            rows={dashboard.activeReferrals.map((referral) => [
              referral.referredCustomer.email,
              referral.referredSubscription?.status ?? "N/A",
              <Badge key={referral.id} tone="success">ACTIVE</Badge>,
            ])}
          />
        </div>
      </Card>
      <Card>
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Inactive referral history</h2>
        <div className="mt-5">
          <DataTable
            columns={["Subscriber", "Last known status", "Referral status"]}
            rows={dashboard.inactiveReferrals.map((referral) => [
              referral.referredCustomer.email,
              referral.referredSubscription?.status ?? "N/A",
              <Badge key={referral.id} tone="danger">{referral.status}</Badge>,
            ])}
          />
        </div>
      </Card>
    </DashboardShell>
  );
}

