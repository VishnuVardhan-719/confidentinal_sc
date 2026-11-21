import { getFormatter, getTranslations } from "next-intl/server";
import { formatPaise } from "@/lib/money";
import { asTk, type Tk } from "./kit";

/** Server-side counterpart of useClinicalFormat (IST dates, INR amounts, module label keys). */
export async function getClinicalFormat(): Promise<{ tk: Tk; dateTime: (iso: string) => string; time: (iso: string) => string; money: (paise: number) => string }> {
  const [t, f] = await Promise.all([getTranslations(), getFormatter()]);
  return {
    tk: asTk(t),
    dateTime: (iso) => f.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }),
    time: (iso) => f.dateTime(new Date(iso), { timeStyle: "short", timeZone: "Asia/Kolkata" }),
    money: (paise) => formatPaise(paise) ?? "—",
  };
}
