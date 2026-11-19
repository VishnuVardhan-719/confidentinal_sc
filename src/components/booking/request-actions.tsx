"use client";

import { CalendarClock, Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CancellationDialog, type CancellationPolicyView } from "@/components/payments/cancellation-dialog";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import type { Slot } from "@/modules/bookings/slots";
import { SlotPicker } from "./slot-picker";

/** "Check for updates": re-renders the server page. There is no live push channel, so the page says when it was read. */
export function RefreshStatus({ updatedAt }: { updatedAt: string }) {
  const t = useTranslations("booking.request");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" onClick={() => start(() => router.refresh())} disabled={pending} aria-busy={pending || undefined}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}{t("refresh")}
      </Button>
      <p className="text-sm text-muted tabular" aria-live="polite">{t("updatedAt", { time: updatedAt })}</p>
    </div>
  );
}

/**
 * Patient changes to an open request: cancel (shared CancellationDialog, closes only after the server
 * confirms) and choose a new time (the doctor must accept again). Both send the version the page was
 * rendered with, so a stale page gets a conflict instead of overwriting a newer change.
 */
export function RequestActions({ bookingId, version, providerId, serviceId, policy, actions }: {
  bookingId: string; version: number; providerId: string; serviceId: string; policy: CancellationPolicyView;
  actions: {
    cancel: (id: unknown, version: unknown) => Promise<ApiResult<{ version: number }>>;
    reschedule: (id: unknown, version: unknown, startAt: unknown) => Promise<ApiResult<{ version: number }>>;
    slots: (input: unknown) => Promise<ApiResult<{ items: Slot[] }>>;
  };
}) {
  const t = useTranslations("booking.request");
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [slots, setSlots] = useState<ApiResult<{ items: Slot[] }> | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"cancelled" | "moved" | null>(null);

  async function openReschedule() {
    setMoving(true); setError(null); setSlot(null); setSlots(null);
    setSlots(await actions.slots({ providerId, serviceId }).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } })));
  }
  async function confirmMove() {
    if (!slot) { setError("required"); return; }
    setBusy(true); setError(null);
    const result = await actions.reschedule(bookingId, version, slot.startAt).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
    setBusy(false);
    // A conflict means the request changed (for example the doctor answered): load the latest version behind the form.
    if (!result.ok) { setError(result.error.code); if (result.error.code === "conflict") router.refresh(); return; }
    setMoving(false); setDone("moved"); router.refresh();
  }

  return (
    <div className="grid gap-4">
      {done === "moved" ? <Notice tone="info" title={t("moved")} role="status" /> : null}
      {done === "cancelled" ? <Notice tone="info" title={t("cancelledNow")} role="status" /> : null}
      <div className="flex flex-wrap gap-3">
        {!moving ? <Button type="button" variant="secondary" onClick={() => void openReschedule()}><CalendarClock aria-hidden />{t("reschedule")}</Button> : null}
        <CancellationDialog policy={policy} trigger={<Button type="button" variant="secondary">{t("cancel")}</Button>}
          onConfirm={async () => {
            const result = await actions.cancel(bookingId, version).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
            if (!result.ok) { if (result.error.code === "conflict") router.refresh(); return { ok: false, code: result.error.code }; }
            setDone("cancelled"); router.refresh();
            return { ok: true };
          }} />
      </div>
      {moving ? (
        <section aria-labelledby="reschedule-title" className="grid gap-4 rounded-md border border-border-strong p-4 sm:p-5">
          <h3 id="reschedule-title" className="text-lg font-semibold text-ink">{t("rescheduleTitle")}</h3>
          <p className="text-sm text-muted">{t("rescheduleNote")}</p>
          {slots === null ? <p role="status" className="flex items-center gap-2 text-muted"><Loader2 aria-hidden className="size-5 animate-spin" />{t("loadingSlots")}</p>
            : !slots.ok ? <InlineError code={slots.error.code} />
            : slots.data.items.length === 0 ? <Notice tone="neutral" title={t("noSlots")} />
            : <SlotPicker idPrefix="reschedule" slots={slots.data.items} value={slot} onChange={value => { setSlot(value); setError(null); }} />}
          {error === "required" ? <InlineError message={t("chooseTime")} /> : error ? <InlineError code={error} /> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void confirmMove()} disabled={busy || !slots?.ok} aria-busy={busy || undefined}>{busy ? <Loader2 aria-hidden className="animate-spin" /> : null}{t("confirmMove")}</Button>
            <Button type="button" variant="quiet" onClick={() => setMoving(false)}>{t("keepTime")}</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
