"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";
import { asTk, rupees, type Tk } from "./kit";

/** Client-side translation of module label keys plus IST date and INR formatting. */
export function useClinicalFormat(): { tk: Tk; dateTime: (iso: string) => string; money: (paise: number) => string; time: (iso: string) => string } {
  const t = useTranslations();
  const f = useFormatter();
  return useMemo(
    () => ({
      tk: asTk(t),
      dateTime: (iso: string) => f.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }),
      time: (iso: string) => f.dateTime(new Date(iso), { timeStyle: "short", timeZone: "Asia/Kolkata" }),
      money: (paise: number) => f.number(rupees(paise), { style: "currency", currency: "INR", maximumFractionDigits: 2 }),
    }),
    [t, f],
  );
}
