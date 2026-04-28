import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireCurrentBusinessId(request?: Request) {
  const user = await requireUser();
  const url = request ? new URL(request.url) : null;
  const requestedBusinessId = url?.searchParams.get("businessId") ?? undefined;
  const membership = requestedBusinessId
    ? user.businessMemberships.find((item) => item.businessId === requestedBusinessId)
    : user.businessMemberships[0];

  if (!membership) {
    throw new Error("No accessible business context was found for this user.");
  }

  return membership.businessId;
}

export async function requireCurrentCustomerId() {
  const user = await requireUser();
  const customer = user.customerProfiles[0];

  if (!customer) {
    throw new Error("No customer profile is linked to this account.");
  }

  return customer.id;
}

export async function requireBusinessForApi(request?: Request) {
  const businessId = await requireCurrentBusinessId(request);
  return prisma.business.findUniqueOrThrow({ where: { id: businessId } });
}

