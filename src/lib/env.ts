import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL."),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters."),
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(100).default(5),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  PLATFORM_FEE_PERCENT: process.env.PLATFORM_FEE_PERCENT ?? "5",
  DEMO_MODE: process.env.DEMO_MODE ?? "true",
});

