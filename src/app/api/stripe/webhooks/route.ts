export async function POST() {
  return Response.json({
    error: "Deprecated endpoint. Use /api/stripe/webhook.",
  }, { status: 410 });
}

