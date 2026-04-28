import { requirePlatformAdmin } from "@/lib/auth";
import { getAdminDashboardData } from "@/lib/dashboard-data";
import { formatCurrency } from "@/lib/money";
import { adminNav } from "@/dashboard-nav";
import { Badge, Card, DashboardShell, DataTable, StatCard } from "@/ui";

export default async function AdminDashboardPage() {
  await requirePlatformAdmin();
  const dashboard = await getAdminDashboardData();

  return (
    <DashboardShell
      title="Platform admin dashboard"
      subtitle="Monitor total subscription volume, active businesses, discounts issued, and webhook processing health across the platform."
      nav={adminNav("/dashboard/admin")}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Businesses" value={String(dashboard.totalBusinesses)} />
        <StatCard label="Platform MRR" value={formatCurrency(dashboard.platformMrr)} />
        <StatCard label="Subscription volume" value={formatCurrency(dashboard.totalSubscriptionVolume)} />
        <StatCard label="Discounts generated" value={formatCurrency(dashboard.totalDiscountsGenerated)} />
      </section>
      <Card>
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Business performance</h2>
        <div className="mt-5">
          <DataTable
            columns={["Business", "Subscribers", "Active referrals", "Net MRR"]}
            rows={dashboard.businesses.map((business) => [business.name, String(business.subscribers), String(business.activeReferrals), formatCurrency(business.netMrr)])}
          />
        </div>
      </Card>
      <Card>
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Recent webhook events</h2>
        <div className="mt-5">
          <DataTable
            columns={["Type", "Business", "Status", "Created"]}
            rows={dashboard.webhookEvents.map((event) => [
              event.type,
              event.business?.name ?? "Unknown",
              <Badge key={event.id} tone={event.status === "FAILED" ? "danger" : event.status === "RECEIVED" ? "warning" : "success"}>{event.status}</Badge>,
              new Date(event.createdAt).toLocaleString(),
            ])}
          />
        </div>
      </Card>
    </DashboardShell>
  );
}

