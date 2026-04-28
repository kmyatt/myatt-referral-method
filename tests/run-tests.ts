process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "test-session-secret-1234567890-abcdefghijklmnopqrstuvwxyz";
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/referme_test";

await import("./referral-service.test");
await import("./stripe-webhook-service.test");
await import("./stripe-service.test");

export {};