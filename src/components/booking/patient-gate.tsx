"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { InlineError } from "@/components/shared/inline-error";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import { bookingReadiness } from "@/modules/patient/readiness";
import type { PatientMember } from "@/modules/patient/schemas";
import { ProfileReadiness } from "./profile-readiness";

export type PatientGateResult = { patientId: string; access: "self" | "authorized_family"; questionnaireComplete: true; healthShareConsent: true };

/**
 * Booking step 1 gate: choose yourself or a family member with a booking grant, show the server-derived
 * "n of N complete" profile check, and require explicit consent to share health details with the visiting doctor.
 * Continue is offered only for a ready profile. Missing items link to the profile owner's form.
 */
export function PatientGate({ members, onContinue }: { members: PatientMember[]; onContinue: (result: PatientGateResult) => void }) {
  const t = useTranslations("booking.gate");
  const uid = useId();
  const bookable = useMemo(() => members.filter(member => member.relation === "self" || member.canBook), [members]);
  const [selected, setSelected] = useState(() => bookable.find(member => member.relation === "self")?.patientId ?? bookable[0]?.patientId);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(false);
  const member = bookable.find(item => item.patientId === selected);
  const readiness = member ? bookingReadiness(member) : { kind: "unknown" as const };
  const ready = readiness.kind === "ready";

  function proceed() {
    if (!member || !ready) return;
    if (!consent) { setError(true); document.getElementById(`${uid}-consent`)?.focus(); return; }
    onContinue({ patientId: member.patientId, access: member.relation === "self" ? "self" : "authorized_family", questionnaireComplete: true, healthShareConsent: true });
  }
  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-lg font-semibold text-ink">{t("choosePatient")}</legend>
        {bookable.map(item => (
          <label key={item.patientId} className={cn("flex min-h-target cursor-pointer items-center gap-3 rounded-md border bg-surface px-4 py-3 text-base text-ink",
            item.patientId === selected ? "border-forest ring-1 ring-forest" : "border-border hover:border-forest")}>
            <input type="radio" name={`${uid}-member`} value={item.patientId} checked={item.patientId === selected}
              onChange={() => { setSelected(item.patientId); setConsent(false); setError(false); }}
              className="size-5 accent-forest focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus" />
            <span className="grid">
              <span className="font-semibold">{item.displayName}</span>
              <span className="text-sm text-muted">{item.relation === "self" ? t("self") : t("family")}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <section aria-labelledby={`${uid}-glance`} className="grid gap-3">
        <h2 id={`${uid}-glance`} className="text-lg font-semibold text-ink">{t("glance")}</h2>
        <ProfileReadiness readiness={readiness} id={`${uid}-readiness`} />
        <div><Button asChild variant="secondary"><Link href="/patient/profile">{t("editProfile")}</Link></Button></div>
      </section>
      {ready ? (
        <div className="grid gap-2">
          <p className="text-sm text-muted">{t("healthUnverified")}</p>
          <label htmlFor={`${uid}-consent`} className="flex min-h-target cursor-pointer items-start gap-3 text-base text-ink">
            <input id={`${uid}-consent`} type="checkbox" checked={consent} aria-describedby={`${uid}-consent-hint${error ? ` ${uid}-consent-error` : ""}`} aria-invalid={error || undefined}
              onChange={event => { setConsent(event.target.checked); if (event.target.checked) setError(false); }}
              className="mt-0.5 size-5 shrink-0 accent-forest focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus" />
            <span className="grid gap-1"><span className="font-semibold">{t("consentLabel")}</span><span id={`${uid}-consent-hint`} className="text-sm text-muted">{t("consentHint")}</span></span>
          </label>
          {error ? <InlineError id={`${uid}-consent-error`} message={t("consentRequired")} /> : null}
        </div>
      ) : null}
      <div>
        <Button type="button" onClick={proceed} disabled={!ready} aria-disabled={!ready || undefined}>{t("continue")}</Button>
      </div>
    </div>
  );
}
