import type { Prisma } from "@prisma/client";

export function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined,
) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);

  return value.toNumber();
}

export function clampPercent(value: number, max = 100) {
  return Math.max(0, Math.min(value, max));
}

export function formatCurrency(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatPercent(value: number) {
  return `${Number(value).toFixed(Number.isInteger(value) ? 0 : 2)}%`;
}

export function roundToCents(amount: number) {
  return Math.round(amount);
}

export function calculateDiscountAmountCents(
  basePriceCents: number,
  discountPercent: number,
) {
  return roundToCents(basePriceCents * (clampPercent(discountPercent) / 100));
}

export function calculateEffectivePriceCents(
  basePriceCents: number,
  discountPercent: number,
) {
  return Math.max(
    basePriceCents - calculateDiscountAmountCents(basePriceCents, discountPercent),
    0,
  );
}

