import { BusinessUserRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const roleWeight: Record<BusinessUserRole, number> = {
  BUSINESS_STAFF: 1,
  BUSINESS_OWNER: 2,
};

export async function requireBusinessMembership(
  businessId?: string,
  minimumRole: BusinessUserRole = BusinessUserRole.BUSINESS_STAFF,
) {
  const user = await requireUser();

  const membership = businessId
    ? user.businessMemberships.find((item) => item.businessId === businessId)
    : user.businessMemberships[0];

  if (!membership) {
    redirect("/dashboard/onboarding");
  }

  if (roleWeight[membership.role] < roleWeight[minimumRole]) {
    redirect("/dashboard");
  }

  return membership;
}

export async function requireBusinessBySlug(slug: string) {
  const business = await prisma.business.findUnique({
    where: { slug },
  });

  if (!business) {
    notFound();
  }

  return business;
}

