import { apiError } from "@/lib/http";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";
import {
  processStripeWebhookEvent,
  type ParsedStripeWebhookEvent,
} from "@/lib/stripe-webhook-service";

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  try {
    const event = stripe && isStripeConfigured() && signature
      ? (stripe.webhooks.constructEvent(
          rawBody,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET!,
        ) as ParsedStripeWebhookEvent)
      : (JSON.parse(rawBody) as ParsedStripeWebhookEvent);

    return Response.json(await processStripeWebhookEvent(event));
  } catch (error) {
    return apiError(error, 400);
  }
}
