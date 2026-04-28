export async function POST() {
  return Response.json({
    error: "Deprecated endpoint. Subscription activation is now handled via /api/stripe/webhook.",
  }, { status: 410 });
}

