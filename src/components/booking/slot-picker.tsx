"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { cn } from "@/components/ui/cn";
import type { Slot } from "@/modules/bookings/slots";

const TAGS = { en: "en-IN", te: "te-IN", hi: "hi-IN" } as const;
const tag = (locale: string) => TAGS[locale as keyof typeof TAGS] ?? "en-IN";
/** IST calendar day of a UTC instant, independent of the browser timezone. */
const istDay = (utc: string) => new Date(Date.parse(utc) + 330 * 60_000).toISOString().slice(0, 10);

export function formatSlotDay(utc: string, locale: string): string {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(new Date(utc));
}
export function formatSlotTime(utc: string, locale: string): string {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date(utc));
}
export function formatSlotFull(utc: string, locale: string): string {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(utc));
}

/**
 * Two radio groups: a day, then a time on that day (India time). Native radios, so arrow keys move within a
 * group and Tab moves between groups. The parent owns the chosen slot; nothing is stored in the URL.
 */
export function SlotPicker({ slots, value, onChange, idPrefix = "slot" }: { slots: Slot[]; value: Slot | null; onChange: (slot: Slot) => void; idPrefix?: string }) {
  const t = useTranslations("booking.wizard.schedule");
  const locale = useLocale();
  const uid = `${idPrefix}-${useId()}`;
  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots) map.set(istDay(slot.startAt), [...map.get(istDay(slot.startAt)) ?? [], slot]);
    return [...map.entries()];
  }, [slots]);
  const [day, setDay] = useState(() => (value ? istDay(value.startAt) : days[0]?.[0]));
  const current = days.find(([key]) => key === day) ?? days[0];
  const pill = (checked: boolean) => cn("flex min-h-target cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-base tabular has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
    checked ? "border-forest bg-forest text-on-forest" : "border-border bg-surface text-ink hover:border-forest");
  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-base font-semibold text-ink">{t("day")}</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {days.map(([key, list]) => (
            <label key={key} className={pill(key === current?.[0])}>
              <input type="radio" className="sr-only" name={`${uid}-day`} value={key} checked={key === current?.[0]} onChange={() => setDay(key)} />
              <span>{formatSlotDay(list[0].startAt, locale)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {current ? (
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-base font-semibold text-ink">{t("time", { day: formatSlotDay(current[1][0].startAt, locale) })}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {current[1].map(slot => {
              const checked = value?.startAt === slot.startAt;
              return (
                <label key={slot.startAt} className={pill(checked)}>
                  <input type="radio" className="sr-only" name={`${uid}-time`} value={slot.startAt} checked={checked} onChange={() => onChange(slot)} />
                  <span>{formatSlotTime(slot.startAt, locale)}</span>
                </label>
              );
            })}
          </div>
          <p className="text-sm text-muted">{t("timezone")}</p>
        </fieldset>
      ) : null}
    </div>
  );
}
