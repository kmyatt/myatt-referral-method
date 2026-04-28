import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import crypto from "node:crypto";

import { WebhookEventStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  handleCheckoutSessionCompleted,
  handleStripeInvoiceCreated,
  handleStripeInvoiceFinalized,
  handleStripeInvoicePaid,
  handleStripeInvoicePaymentFailed,
  handleStripeSubscriptionUpdated,
} from "@/lib/stripe-service";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type ParsedStripeWebhookEvent = {
  id?: string;
  type?: string;
  created?: number;
  data: {
    object: unknown;
  };
};

export type StripeWebhookHandlers = {
  handleCheckoutSessionCompleted: (session: Stripe.Checkout.Session) => Promise<unknown>;
  handleStripeSubscriptionUpdated: (
    subscription: Stripe.Subscription,
    reason:
      | "customer.subscription.created"
      | "customer.subscription.updated"
      | "customer.subscription.deleted",
    eventContext?: StripeEventContext,
  ) => Promise<unknown>;
  handleStripeInvoicePaid: (
    invoice: Stripe.Invoice,
    eventContext?: StripeEventContext,
  ) => Promise<unknown>;
  handleStripeInvoiceCreated: (
    invoice: Stripe.Invoice,
    eventContext?: StripeEventContext,
  ) => Promise<unknown>;
  handleStripeInvoiceFinalized: (
    invoice: Stripe.Invoice,
    eventContext?: StripeEventContext,
  ) => Promise<unknown>;
  handleStripeInvoicePaymentFailed: (
    invoice: Stripe.Invoice,
    eventContext?: StripeEventContext,
  ) => Promise<unknown>;
};

export type StripeEventContext = {
  eventId?: string | null;
  eventCreatedAt?: Date | null;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

const defaultHandlers: StripeWebhookHandlers = {
  handleCheckoutSessionCompleted,
  handleStripeSubscriptionUpdated,
  handleStripeInvoiceCreated,
  handleStripeInvoiceFinalized,
  handleStripeInvoicePaid,
  handleStripeInvoicePaymentFailed,
};

export async function processStripeWebhookEvent(
  event: ParsedStripeWebhookEvent,
  input: {
    db?: DbClient;
    handlers?: StripeWebhookHandlers;
  } = {},
) {
  const db = input.db ?? prisma;
  const handlers = input.handlers ?? defaultHandlers;
  const eventId = event.id ?? crypto.randomUUID();
  const eventCreatedAt =
    typeof event.created === "number" ? new Date(event.created * 1000) : null;

  const existingWebhookEvent = await db.webhookEvent.findUnique({
    where: { eventId },
    select: { status: true },
  });

  if (existingWebhookEvent?.status === WebhookEventStatus.PROCESSED) {
    return { received: true, duplicate: true, eventId };
  }

  await db.webhookEvent.upsert({
    where: { eventId },
    update: {
      status: WebhookEventStatus.RECEIVED,
      payload: toJson(event),
    },
    create: {
      eventId,
      type: event.type ?? "unknown",
      status: WebhookEventStatus.RECEIVED,
      payload: toJson(event),
    },
  });

  const eventContext: StripeEventContext = {
    eventId,
    eventCreatedAt,
  };

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handlers.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.created":
        await handlers.handleStripeSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          "customer.subscription.created",
          eventContext,
        );
        break;
      case "customer.subscription.updated":
        await handlers.handleStripeSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          "customer.subscription.updated",
          eventContext,
        );
        break;
      case "customer.subscription.deleted":
        await handlers.handleStripeSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          "customer.subscription.deleted",
          eventContext,
        );
        break;
      case "invoice.created":
        await handlers.handleStripeInvoiceCreated(
          event.data.object as Stripe.Invoice,
          eventContext,
        );
        break;
      case "invoice.finalized":
        await handlers.handleStripeInvoiceFinalized(
          event.data.object as Stripe.Invoice,
          eventContext,
        );
        break;
      case "invoice.paid":
        await handlers.handleStripeInvoicePaid(
          event.data.object as Stripe.Invoice,
          eventContext,
        );
        break;
      case "invoice.payment_failed":
        await handlers.handleStripeInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
          eventContext,
        );
        break;
      default:
        break;
    }

    await db.webhookEvent.updateMany({
      where: { eventId },
      data: {
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    return { received: true, duplicate: false, eventId };
  } catch (error) {
    await db.webhookEvent.updateMany({
      where: { eventId },
      data: {
        status: WebhookEventStatus.FAILED,
        errorMessage:
          error instanceof Error ? error.message : "Webhook processing failed.",
      },
    });

    throw error;
  }
}
