export const FEATURE_FLAGS = [
  "clinical",
  "livePayments",
  "emergencyDispatch",
  "pharmacy",
  "subscriptions",
  "gps",
  "automatedPayouts",
  "payAfter",
  "notifySms",
  "notifyEmail",
  "notifyWhatsapp",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

const ENV_NAMES: Record<FeatureFlag, string> = {
  clinical: "FEATURE_CLINICAL",
  livePayments: "FEATURE_LIVE_PAYMENTS",
  emergencyDispatch: "FEATURE_EMERGENCY_DISPATCH",
  pharmacy: "FEATURE_PHARMACY",
  subscriptions: "FEATURE_SUBSCRIPTIONS",
  gps: "FEATURE_GPS",
  automatedPayouts: "FEATURE_AUTOMATED_PAYOUTS",
  payAfter: "FEATURE_PAY_AFTER",
  notifySms: "FEATURE_NOTIFY_SMS",
  notifyEmail: "FEATURE_NOTIFY_EMAIL",
  notifyWhatsapp: "FEATURE_NOTIFY_WHATSAPP",
};

/** Server-side only. Every flag is OFF unless its env var is exactly "true". */
export function isEnabled(
  flag: FeatureFlag,
  source: Record<string, string | undefined> = process.env,
): boolean {
  return source[ENV_NAMES[flag]] === "true";
}
