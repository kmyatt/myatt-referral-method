import { BusinessUserRole } from "@prisma/client";

import { ReferralSettingsForm } from "@/client-forms";
import { businessNav } from "@/dashboard-nav";
import { requireBusinessMembership } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, DashboardShell } from "@/ui";

export default async function ReferralSettingsPage() {
  const membership = await requireBusinessMembership(undefined, BusinessUserRole.BUSINESS_STAFF);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: membership.businessId } });

  return (
    <DashboardShell
      title="Referral settings"
      subtitle="Define the default referral percentage for the business and whether the program is currently active. Plan-level overrides can be configured separately."
      nav={businessNav("/dashboard/business/referral-settings")}
    >
      <Card>
        <ReferralSettingsForm
          initialValues={{
            referralProgramEnabled: business.referralProgramEnabled,
            defaultReferralPercent: Number(business.defaultReferralPercent),
            maxReferralDiscountPercent: business.maxReferralDiscountPercent ? Number(business.maxReferralDiscountPercent) : null,
          }}
        />
      </Card>
    </DashboardShell>
  );
}

