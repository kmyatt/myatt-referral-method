type ReferralDebugPayload = Record<string, unknown>;

export function isReferralDebugEnabled() {
  return process.env.REFERRAL_DEBUG === "true";
}

export function logReferralDebug(event: string, payload: ReferralDebugPayload) {
  if (!isReferralDebugEnabled()) {
    return;
  }

  console.info(
    `[referral-debug] ${event}`,
    JSON.stringify(payload, null, 2),
  );
}
