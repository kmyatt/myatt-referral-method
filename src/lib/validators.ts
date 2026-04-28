import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const signupSchema = z.object({
  firstName: z.string().trim().min(2),
  lastName: z.string().trim().min(2),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
    .regex(/[0-9]/, "Password must contain at least one number."),
  accountType: z.enum(["BUSINESS", "CUSTOMER"]).default("BUSINESS"),
});

export const businessOnboardingSchema = z.object({
  businessName: z.string().trim().min(2),
  businessSlug: z.string().trim().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().min(10).max(280),
  supportEmail: z.string().email(),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  defaultReferralPercent: z.coerce.number().min(0).max(100),
  maxReferralDiscountPercent: z.coerce.number().min(0).max(100).optional(),
});

export const planSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().min(10).max(280),
  priceCents: z.coerce.number().int().min(100),
  referralPercentOverride: z.coerce.number().min(0).max(100).optional(),
  maxDiscountPercent: z.coerce.number().min(0).max(100).optional(),
  minPriceCents: z.coerce.number().int().min(0).optional(),
}).refine(
  (value) =>
    value.minPriceCents === undefined || value.minPriceCents <= value.priceCents,
  {
    message: "Minimum price cannot exceed the base plan price.",
    path: ["minPriceCents"],
  },
);

export const referralSettingsSchema = z.object({
  referralProgramEnabled: z.coerce.boolean(),
  defaultReferralPercent: z.coerce.number().min(0).max(100),
  maxReferralDiscountPercent: z.coerce.number().min(0).max(100).optional(),
});

export const checkoutCreateSchema = z.object({
  businessSlug: z.string().min(2),
  planId: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().trim().min(2),
  lastName: z.string().trim().min(2),
  password: z.string().min(8),
  referralCode: z.string().trim().optional(),
});


