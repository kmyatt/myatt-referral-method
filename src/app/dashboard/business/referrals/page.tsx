import { BusinessUserRole } from "@prisma/client";

import { businessNav } from "@/dashboard-nav";
import { getBusinessDashboardData } from "@/lib/dashboard-data";
import { decimalToNumber, formatPercent } from "@/lib/money";
import { requireBusinessMembership } from "@/lib/permissions";
import { Badge, Card, DashboardShell, DataTable } from "@/ui";

export default async function BusinessReferralsPage() {
  const membership = await requireBusinessMembership(undefined, BusinessUserRole.BUSINESS_STAFF);
  const dashboard = await getBusinessDashboardData(membership.businessId);

  return (
    <DashboardShell
      title="Referral analytics"
      subtitle="See who referred whom, which referred subscribers are active, and where referral-created discounts are currently coming from."
      nav={businessNav("/dashboard/business/referrals")}
    >
      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Active referrals</p>
          <p className="mt-2 text-3xl font-semibold">{dashboard.referrals.filter((item) => item.status === "ACTIVE").length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Pending referrals</p>
          <p className="mt-2 text-3xl font-semibold">{dashboard.referrals.filter((item) => item.status === "PENDING").length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Inactive referrals</p>
          <p className="mt-2 text-3xl font-semibold">{dashboard.referrals.filter((item) => item.status === "INACTIVE").length}</p>
        </Card>
      </section>
      <Card>
        <DataTable
          columns={["Referrer", "Referred", "Subscription status", "Referral status", "Rate at creation"]}
          rows={dashboard.referrals.map((referral) => [
            referral.referrerCustomer.email,
            referral.referredCustomer.email,
            referral.referredSubscription?.status ?? "No subscription",
            <Badge key={referral.id} tone={referral.status === "ACTIVE" ? "success" : referral.status === "PENDING" ? "warning" : "danger"}>{referral.status}</Badge>,
            formatPercent(decimalToNumber(referral.discountPercentAtCreation)),
          ])}
        />
      </Card>
    </DashboardShell>
  );
}

