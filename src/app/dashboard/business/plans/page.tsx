import { BusinessUserRole } from "@prisma/client";

import { PlanForm } from "@/client-forms";
import { businessNav } from "@/dashboard-nav";
import { getBusinessDashboardData } from "@/lib/dashboard-data";
import { formatCurrency, formatPercent } from "@/lib/money";
import { requireBusinessMembership } from "@/lib/permissions";
import { Card, DashboardShell } from "@/ui";

export default async function BusinessPlansPage() {
  const membership = await requireBusinessMembership(undefined, BusinessUserRole.BUSINESS_STAFF);
  const dashboard = await getBusinessDashboardData(membership.businessId);

  return (
    <DashboardShell
      title="Plan management"
      subtitle="Create and tune subscription plans. Every plan can optionally override the business-level referral percentage."
      nav={businessNav("/dashboard/business/plans")}
    >
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">Create a new plan</h2>
          <div className="mt-5">
            <PlanForm endpoint="/api/business/plans" submitLabel="Create plan" />
          </div>
        </Card>
        <div className="space-y-4">
          {dashboard.plans.map((plan) => (
            <Card key={plan.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">{plan.name}</h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{plan.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold text-slate-950">{formatCurrency(plan.priceCents)}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{plan.referralPercentOverride ? formatPercent(Number(plan.referralPercentOverride)) : "Uses business default"}</p>
                </div>
              </div>
              <div className="mt-6 border-t border-[var(--line)] pt-6">
                <PlanForm
                  endpoint={`/api/business/plans/${plan.id}`}
                  submitLabel="Update plan"
                  initialValues={{
                    name: plan.name,
                    slug: plan.slug,
                    description: plan.description ?? "",
                    priceCents: plan.priceCents,
                    referralPercentOverride: plan.referralPercentOverride ? Number(plan.referralPercentOverride) : undefined,
                  }}
                />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

