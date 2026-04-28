import { calculateDiscountAmountCents, calculateEffectivePriceCents } from "@/lib/money";

export function computeDiscountSnapshot(input: {
  activeReferralCount: number;
  rewardPerReferral: number;
  basePrice: number;
  maxDiscount?: number;
}) {
  const totalDiscountPercent = Math.min(
    input.activeReferralCount * input.rewardPerReferral,
    input.maxDiscount ?? 100,
  );
  const basePriceCents = Math.round(input.basePrice * 100);
  const discountAmountCents = calculateDiscountAmountCents(basePriceCents, totalDiscountPercent);
  const finalPriceCents = calculateEffectivePriceCents(basePriceCents, totalDiscountPercent);

  return {
    activeReferralCount: input.activeReferralCount,
    referralPercent: input.rewardPerReferral,
    totalDiscountPercent,
    discountAmountCents,
    finalPrice: finalPriceCents / 100,
  };
}

