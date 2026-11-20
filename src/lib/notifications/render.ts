import { z } from "zod";
import { en, type TemplateKey } from "./templates/en";
import { te } from "./templates/te";
import { hi } from "./templates/hi";

export const locales = { en, te, hi };
export const externalKeys = ["ext.booking_update", "ext.action_needed", "ext.not_going_ahead", "ext.account_update"] as const;
export function renderExternal(key: string, locale: keyof typeof locales, params: unknown, appOrigin: string): string {
  const k = z.enum(externalKeys).parse(key);
  const v = z.object({ ref: z.string().regex(/^SCV-[0-9]{12}$/).optional(), link: z.url() }).strict().parse(params);
  if (k !== "ext.account_update" && !v.ref) throw new Error("missing_reference");
  const origin = new URL(appOrigin);
  const url = new URL(v.link);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password
    || url.origin !== origin.origin || url.search || url.hash || url.username || url.password
    || !new RegExp(`^/${locale}/(?:patient|provider)$`).test(url.pathname)
    || v.link !== `${url.origin}${url.pathname}`) throw new Error("invalid_link");
  const template = locales[locale]?.[k];
  if (!template?.reviewed) throw new Error("unreviewed_template");
  const text = template.text.replaceAll("{ref}", v.ref ?? "").replaceAll("{link}", v.link);
  const budget = locale === "en" ? 160 : 140;
  if (text.length > budget) throw new Error("message_too_long");
  return text;
}
export function renderInbox(key: string, locale: keyof typeof locales, params: { amount_paise?: string; emergency_notice?: boolean }) {
  if (!(key in en) || key.startsWith("ext.")) throw new Error("unknown_template");
  const k = key as TemplateKey;
  const template = locales[locale]?.[k]?.reviewed ? locales[locale][k] : en[k];
  let text = template.text;
  if (text.includes("{amount}")) {
    const paise = z.string().regex(/^(0|[1-9][0-9]{0,14})$/).parse(params.amount_paise);
    const integer = BigInt(paise);
    const hundred = BigInt(100);
    text = text.replaceAll("{amount}", `₹${integer / hundred}.${String(integer % hundred).padStart(2, "0")}`);
  }
  if (params.emergency_notice) text += " In an emergency call 112.";
  return text;
}
