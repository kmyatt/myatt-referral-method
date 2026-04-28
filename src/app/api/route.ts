export async function GET() {
  return Response.json({
    name: "Myatt Referral Method API",
    routes: [
      "/api/checkout/create",
      "/api/customer/me",
      "/api/customer/referrals",
      "/api/customer/subscription",
      "/api/business/dashboard",
      "/api/business/customers",
      "/api/business/referrals",
      "/api/business/plans",
      "/api/business/referral-settings",
      "/api/business/analytics",
      "/api/admin/businesses",
      "/api/admin/analytics",
      "/api/admin/webhook-events",
      "/api/stripe/webhook",
    ],
  });
}

