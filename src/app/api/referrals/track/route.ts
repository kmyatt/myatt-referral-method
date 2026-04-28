export async function POST() {
  return Response.json({
    error: "Deprecated endpoint. Use /api/checkout/create and Stripe webhooks instead.",
  }, { status: 410 });
}

