import { BusinessUserRole } from "@prisma/client";

import { businessNav } from "@/dashboard-nav";
import { getBusinessDashboardData } from "@/lib/dashboard-data";
import { formatCurrency } from "@/lib/money";
import { requireBusinessMembership } from "@/lib/permissions";
import { Badge, Card, DashboardShell, DataTable } from "@/ui";

export default async function BusinessCustomersPage() {
  const membership = await requireBusinessMembership(undefined, BusinessUserRole.BUSINESS_STAFF);
  const dashboard = await getBusinessDashboardData(membership.businessId);

  return (
    <DashboardShell
      title="Customer management"
      subtitle="Monitor subscribers, their current plan, live effective price, and the status that determines whether referral discounts stay active."
      nav={businessNav("/dashboard/business/customers")}
    >
      <Card>
        <DataTable
          columns={["Customer", "Plan", "Status", "Base price", "Effective price"]}
          rows={dashboard.customers.map((customer) => {
            const subscription = customer.subscriptions[0];
            return [
              customer.email,
              subscription?.plan.name ?? "No subscription",
              <Badge key={customer.id} tone={subscription?.status === "ACTIVE" ? "success" : subscription?.status === "PAST_DUE" ? "warning" : "danger"}>{subscription?.status ?? customer.status}</Badge>,
              subscription ? formatCurrency(subscription.basePriceCents) : "N/A",
              subscription ? formatCurrency(subscription.effectivePriceCents) : "N/A",
            ];
          })}
        />
      </Card>
    </DashboardShell>
  );
}

