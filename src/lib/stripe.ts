import Stripe from "stripe";

import { env } from "@/lib/env";

let stripeSingleton: Stripe | null | undefined;

export function isStripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

export function getStripeClient() {
  if (!env.STRIPE_SECRET_KEY) {
    return null;
  }

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(env.STRIPE_SECRET_KEY);
  }

  return stripeSingleton;
}

export function buildAbsoluteUrl(pathname: string) {
  return new URL(pathname, env.NEXT_PUBLIC_APP_URL).toString();
}

