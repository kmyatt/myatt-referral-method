import assert from "node:assert/strict";
import test from "node:test";

import { WebhookEventStatus } from "@prisma/client";

import { processStripeWebhookEvent } from "../src/lib/stripe-webhook-service";

function createWebhookDb() {
  const events = new Map<
    string,
    {
      eventId: string;
      status: WebhookEventStatus;
      payload: unknown;
      processedAt?: Date;
      errorMessage?: string;
    }
  >();

  return {
    state: { events },
    db: {
      webhookEvent: {
        async findUnique(args: { where: { eventId: string } }) {
          const event = events.get(args.where.eventId);
          return event ? { status: event.status } : null;
        },
        async upsert(args: {
          where: { eventId: string };
          update: { status: WebhookEventStatus; payload: unknown };
          create: {
            eventId: string;
            type: string;
            status: WebhookEventStatus;
            payload: unknown;
          };
        }) {
          const existing = events.get(args.where.eventId);
          if (existing) {
            const updated = { ...existing, ...args.update };
            events.set(args.where.eventId, updated);
            return updated;
          }

          events.set(args.where.eventId, {
            eventId: args.create.eventId,
            status: args.create.status,
            payload: args.create.payload,
          });

          return events.get(args.where.eventId)!;
        },
        async updateMany(args: {
          where: { eventId: string };
          data: {
            status: WebhookEventStatus;
            processedAt?: Date;
            errorMessage?: string;
          };
        }) {
          const existing = events.get(args.where.eventId);
          if (!existing) {
            return { count: 0 };
          }

          events.set(args.where.eventId, { ...existing, ...args.data });
          return { count: 1 };
        },
      },
    },
  };
}

test("idempotency: processing the same webhook event twice does not dispatch twice", async () => {
  const { db, state } = createWebhookDb();
  const calls = {
    subscription: 0,
  };

  const handlers = {
    async handleCheckoutSessionCompleted() {
      throw new Error("Unexpected checkout dispatch.");
    },
    async handleStripeSubscriptionUpdated() {
      calls.subscription += 1;
      return null;
    },
    async handleStripeInvoiceCreated() {
      throw new Error("Unexpected invoice created dispatch.");
    },
    async handleStripeInvoiceFinalized() {
      throw new Error("Unexpected invoice finalized dispatch.");
    },
    async handleStripeInvoicePaid() {
      throw new Error("Unexpected invoice paid dispatch.");
    },
    async handleStripeInvoicePaymentFailed() {
      throw new Error("Unexpected invoice failed dispatch.");
    },
  };

  const event = {
    id: "evt_duplicate_1",
    type: "customer.subscription.updated",
    created: 1777777777,
    data: {
      object: {
        id: "sub_123",
      },
    },
  };

  const firstResult = await processStripeWebhookEvent(event, {
    db: db as never,
    handlers,
  });
  const secondResult = await processStripeWebhookEvent(event, {
    db: db as never,
    handlers,
  });

  assert.equal(firstResult.duplicate, false);
  assert.equal(secondResult.duplicate, true);
  assert.equal(calls.subscription, 1);
  assert.equal(
    state.events.get(event.id)?.status,
    WebhookEventStatus.PROCESSED,
  );
});
