"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { buildReviewSummary, STEP_LABEL_KEYS, type ClinicalStepId, type MissingFieldMeta } from "@/modules/clinical/editor";
import type { ClinicalDraftContent, VitalWarning } from "@/modules/clinical/schemas";
import type { Tk } from "../kit";

/** Read-only summary of all steps. Values are shown exactly as entered (units/doses untouched). */
export function ClinicalSummary({ content, warnings, tk, onEdit, headingLevel = "h3" }: { content: ClinicalDraftContent; warnings: VitalWarning[]; tk: Tk; onEdit?: (step: ClinicalStepId) => void; headingLevel?: "h2" | "h3" }) {
  const t = useTranslations("clinical");
  const s = buildReviewSummary(content, warnings);
  const H = headingLevel;
  const none = t("review.nothingRecorded");
  const v = s.vitals;
  const nm = new Set(v.notMeasured ?? []);
  const measure = (key: string, text: string | null) => (nm.has(key as never) ? t("review.notMeasured") : text ?? none);

  const section = (step: ClinicalStepId, body: ReactNode) => (
    <section className="grid gap-3 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <H className="font-semibold text-ink">{tk(STEP_LABEL_KEYS[step])}</H>
        {onEdit ? (
          <button type="button" className="inline-flex min-h-target items-center text-forest underline underline-offset-4" onClick={() => onEdit(step)}>
            {t("review.edit", { step: tk(STEP_LABEL_KEYS[step]) })}
          </button>
        ) : null}
      </div>
      {body}
    </section>
  );
  const row = (label: string, value: ReactNode) => (
    <div className="grid gap-0.5 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap text-ink">{value}</dd>
    </div>
  );

  return (
    <div className="grid gap-5">
      {section(
        "vitals",
        <dl className="grid gap-2 tabular">
          {row(t("vitals.temperature"), measure("temperature", v.temperature ? `${v.temperature.value} °${v.temperature.unit}` : null))}
          {row(t("vitals.bloodPressure"), measure("bloodPressure", v.bloodPressure ? `${v.bloodPressure.systolicMmHg}/${v.bloodPressure.diastolicMmHg} mmHg` : null))}
          {row(t("vitals.pulse"), measure("pulseBpm", typeof v.pulseBpm === "number" ? String(v.pulseBpm) : null))}
          {row(t("vitals.spo2"), measure("spo2Percent", typeof v.spo2Percent === "number" ? String(v.spo2Percent) : null))}
          {row(t("vitals.respiratoryRate"), measure("respiratoryRatePerMin", typeof v.respiratoryRatePerMin === "number" ? String(v.respiratoryRatePerMin) : null))}
          {row(t("vitals.height"), measure("heightCm", typeof v.heightCm === "number" ? String(v.heightCm) : null))}
          {row(t("vitals.weight"), measure("weightKg", typeof v.weightKg === "number" ? String(v.weightKg) : null))}
          {row(t("vitals.exam"), v.examinationFindings?.trim() || none)}
        </dl>,
      )}
      {section(
        "assessment",
        <dl className="grid gap-2">
          {row(t("assessment.chiefComplaint"), s.assessment.chiefComplaint?.trim() || none)}
          {row(t("assessment.type"), s.assessment.assessmentType ? tk(`clinical.assessmentType.${s.assessment.assessmentType}`) : none)}
          {row(t("assessment.assessmentText"), s.assessment.assessmentText?.trim() || none)}
          {s.assessment.uncertaintyNote?.trim() ? row(t("assessment.uncertainty"), s.assessment.uncertaintyNote) : null}
          {s.assessment.differentials?.some((d) => d.trim()) ? row(t("assessment.differentials"), s.assessment.differentials.filter((d) => d.trim()).join("\n")) : null}
        </dl>,
      )}
      {section(
        "prescription",
        <div className="grid gap-3">
          {s.prescription.mode === "none" ? <p className="text-ink">{t("review.medicinesNone")}</p> : null}
          {s.prescription.mode === "unset" ? <p className="text-muted">{t("review.medicinesUnset")}</p> : null}
          {s.prescription.mode === "medicines" ? (
            <ol className="grid list-decimal gap-2 pl-6">
              {s.prescription.items.map((m) => (
                <li key={m.key} className="text-ink">
                  <span className="font-semibold">{m.name || none}</span>
                  {[m.formulationStrength, m.dose, m.route, m.frequency, m.duration, m.quantity].filter((x) => x?.trim()).map((x) => ` · ${x}`)}
                  {m.instructions?.trim() ? <span className="block text-sm text-muted">{m.instructions}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
          {s.prescription.mode === "medicines" ? <p className="text-sm text-muted">{s.prescription.allergyReviewed ? t("review.allergyReviewed") : t("review.allergyNotReviewed")}</p> : null}
          {s.prescription.tests.length ? (
            <ul className="grid gap-1">
              {s.prescription.tests.map((r) => (
                <li key={r.key} className="text-ink">
                  {t(`prescription.testKind.${r.kind}`)}: {r.description || none}
                </li>
              ))}
            </ul>
          ) : null}
        </div>,
      )}
      {section(
        "care",
        <dl className="grid gap-2">
          {row(t("care.advice"), s.care.advice?.trim() || none)}
          {s.care.redFlagsAdvice?.trim() ? row(t("care.redFlags"), s.care.redFlagsAdvice) : null}
          {row(
            t("care.followUp"),
            !s.care.followUp || s.care.followUp.mode === "unset"
              ? none
              : s.care.followUp.mode === "not_required"
                ? t("care.followUpNotRequired")
                : [t("care.followUpRecommended"), s.care.followUp.date, s.care.followUp.note].filter(Boolean).join(" · "),
          )}
        </dl>,
      )}
    </div>
  );
}

export function MissingList({ missing, tk, onGo }: { missing: MissingFieldMeta[]; tk: Tk; onGo: (m: MissingFieldMeta) => void }) {
  const t = useTranslations("clinical.review");
  if (missing.length === 0) return null;
  return (
    <section aria-labelledby="missing-title" className="grid gap-2 rounded-md border border-warning/40 bg-warning-surface p-4">
      <h3 id="missing-title" className="font-semibold text-ink">
        {t("missingTitle")}
      </h3>
      <ul aria-labelledby="missing-title" className="grid gap-1">
        {missing.map((m) => (
          <li key={m.field}>
            <button type="button" className="inline-flex min-h-target items-center text-left text-ink underline underline-offset-4" onClick={() => onGo(m)}>
              {tk(m.labelKey)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
