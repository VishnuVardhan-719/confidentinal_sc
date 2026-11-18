"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { FormSection } from "@/components/shared/field";
import { Notice } from "@/components/shared/notice";
import {
  acknowledgeAllergyReview,
  acknowledgeWarning,
  addMedicineLine,
  addTestOrReferral,
  changePrescriptionMode,
  defaultKeyFactory,
  moveMedicineLine,
  removeMedicineLine,
  removeTestOrReferral,
  setFollowUp,
  setNotMeasured,
  setVital,
  updateMedicineLine,
  type VitalKey,
} from "@/modules/clinical/editor";
import type { AssessmentStep, CareStep, MedicineLine, Prescription, PrescriptionStep, TestOrReferral, VitalsStep, VitalWarning } from "@/modules/clinical/schemas";
import type { Tk } from "../kit";
import { bpReading } from "./bp";
import { CheckField, ChoiceField, DateField, LongTextField, NumberField, SelectField, TextField } from "./fields";

type StepProps<T> = { value: T; onChange: (v: T) => void; disabled?: boolean; idPrefix: string };

// ---- Step 1 ----------------------------------------------------------------------------------
export function VitalsForm({ value, onChange, disabled, idPrefix, warnings, tk }: StepProps<VitalsStep> & { warnings: VitalWarning[]; tk: Tk }) {
  const t = useTranslations("clinical.vitals");
  const notMeasured = new Set(value.notMeasured ?? []);
  const nm = (key: VitalKey) => (
    <label className="inline-flex min-h-target cursor-pointer items-center gap-2 text-sm text-muted">
      <input type="checkbox" className="size-4 accent-forest" checked={notMeasured.has(key)} disabled={disabled} onChange={(e) => {
          if (key === "temperature") setTempDraft({});
          if (key === "bloodPressure") setBpDraft({});
          onChange(setNotMeasured(value, key, e.target.checked));
        }}
      />
      {t("notMeasured")}
    </label>
  );
  const num = (key: Exclude<VitalKey, "temperature" | "bloodPressure">, label: string, integer = false, max?: number) => (
    <div className="grid content-start gap-1">
      <NumberField
        key={`${key}-${notMeasured.has(key)}`}
        id={`${idPrefix}-${key}`}
        label={label}
        integer={integer}
        max={max}
        disabled={disabled || notMeasured.has(key)}
        value={value[key]}
        onValue={(n) => onChange(setVital(value, key, n))}
      />
      {nm(key)}
    </div>
  );
  const temp = value.temperature;
  const bp = value.bloodPressure;
  // Local, not-yet-complete entries: they never reach the draft until valid, so a half-entered
  // temperature (no unit) or blood pressure (one side) cannot be saved as a wrong reading.
  const [tempDraft, setTempDraft] = useState<{ value?: number; unit?: "C" | "F" }>(() => (temp ? { value: temp.value, unit: temp.unit } : {}));
  const [bpDraft, setBpDraft] = useState<{ sys?: number; dia?: number }>(() => (bp ? { sys: bp.systolicMmHg, dia: bp.diastolicMmHg } : {}));
  const tempIncomplete = tempDraft.value !== undefined && !tempDraft.unit;
  const bpIncomplete = (bpDraft.sys === undefined) !== (bpDraft.dia === undefined);

  const commitTemp = (next: { value?: number; unit?: "C" | "F" }) => {
    setTempDraft(next);
    if (next.value === undefined) onChange(setVital(value, "temperature", undefined));
    else if (next.unit) onChange(setVital(value, "temperature", { value: next.value, unit: next.unit }));
  };
  const commitBp = (next: { sys?: number; dia?: number }) => {
    setBpDraft(next);
    // Only a complete pair is a reading; an incomplete entry removes the previously committed one
    // so the saved draft never shows an old value next to a half-typed new one.
    const reading = bpReading(next);
    if (reading !== undefined || value.bloodPressure !== undefined) onChange(setVital(value, "bloodPressure", reading));
  };

  return (
    <div className="grid gap-8">
      <p className="text-muted">{t("intro")}</p>
      <FormSection legend={t("temperature")}>
        <div className="flex flex-wrap items-start gap-6">
          <NumberField
            key={`temp-${notMeasured.has("temperature")}`}
            id={`${idPrefix}-temperature`}
            label={t("temperature")}
            disabled={disabled || notMeasured.has("temperature")}
            value={tempDraft.value}
            onValue={(n) => commitTemp({ ...tempDraft, value: n })}
          />
          <SelectField
            id={`${idPrefix}-temperatureUnit`}
            label={t("temperatureUnit")}
            required={tempDraft.value !== undefined}
            disabled={disabled || notMeasured.has("temperature")}
            value={tempDraft.unit ?? ""}
            placeholder={t("unitPlaceholder")}
            error={tempIncomplete ? t("unitRequired") : undefined}
            options={[
              { value: "C", label: t("unitC") },
              { value: "F", label: t("unitF") },
            ]}
            onValue={(u) => commitTemp({ ...tempDraft, unit: u || undefined })}
          />
        </div>
        {nm("temperature")}
      </FormSection>
      <FormSection legend={t("bloodPressure")}>
        <div className="flex flex-wrap gap-6">
          <NumberField
            key={`sys-${notMeasured.has("bloodPressure")}`}
            id={`${idPrefix}-systolic`}
            label={t("systolic")}
            integer
            disabled={disabled || notMeasured.has("bloodPressure")}
            value={bpDraft.sys}
            onValue={(n) => commitBp({ ...bpDraft, sys: n })}
          />
          <NumberField
            key={`dia-${notMeasured.has("bloodPressure")}`}
            id={`${idPrefix}-diastolic`}
            label={t("diastolic")}
            integer
            disabled={disabled || notMeasured.has("bloodPressure")}
            value={bpDraft.dia}
            onValue={(n) => commitBp({ ...bpDraft, dia: n })}
            externalError={bpIncomplete ? t("bpBoth") : undefined}
          />
        </div>
        {nm("bloodPressure")}
      </FormSection>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {num("pulseBpm", t("pulse"), true)}
        {num("spo2Percent", t("spo2"), false, 100)}
        {num("respiratoryRatePerMin", t("respiratoryRate"), true)}
        {num("heightCm", t("height"))}
        {num("weightKg", t("weight"))}
      </div>
      {warnings.length > 0 ? (
        <section id={`${idPrefix}-warnings`} tabIndex={-1} aria-labelledby={`${idPrefix}-warnings-title`} className="grid gap-3">
          <h3 id={`${idPrefix}-warnings-title`} className="font-semibold text-ink">
            {t("warningsTitle")}
          </h3>
          {warnings.map((w) => (
            <Notice key={w.ruleId} tone={w.severity === "danger" ? "danger" : "warning"} title={tk(w.labelKey)}>
              {w.requiresAcknowledgment ? (
                <CheckField id={`${idPrefix}-ack-${w.ruleId}`} label={t("acknowledge")} checked={w.acknowledged} disabled={disabled || w.acknowledged} onChecked={(c) => c && onChange(acknowledgeWarning(value, w.ruleId))} />
              ) : null}
            </Notice>
          ))}
        </section>
      ) : null}
      <LongTextField id={`${idPrefix}-exam`} label={t("exam")} rows={5} maxLength={8000} disabled={disabled} value={value.examinationFindings} onValue={(v) => onChange({ ...value, examinationFindings: v })} />
    </div>
  );
}

// ---- Step 2 ----------------------------------------------------------------------------------
export function AssessmentForm({ value, onChange, disabled, idPrefix, errors }: StepProps<AssessmentStep> & { errors: Record<string, string> }) {
  const t = useTranslations("clinical.assessment");
  const set = (patch: Partial<AssessmentStep>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-6">
      <LongTextField id={`${idPrefix}-chiefComplaint`} label={t("chiefComplaint")} required rows={3} disabled={disabled} error={errors["assessment.chiefComplaint"]} value={value.chiefComplaint} onValue={(v) => set({ chiefComplaint: v })} />
      <TextField id={`${idPrefix}-duration`} label={t("duration")} maxLength={200} disabled={disabled} value={value.symptomDuration} onValue={(v) => set({ symptomDuration: v })} />
      <LongTextField id={`${idPrefix}-exam`} label={t("exam")} rows={3} maxLength={8000} disabled={disabled} value={value.examinationFindings} onValue={(v) => set({ examinationFindings: v })} />
      <ChoiceField
        id={`${idPrefix}-assessmentType`}
        legend={t("type")}
        disabled={disabled}
        error={errors["assessment.assessmentType"]}
        value={value.assessmentType}
        onValue={(v) => set({ assessmentType: v })}
        options={[
          { value: "provisional", label: t("provisional"), hint: t("provisionalHint") },
          { value: "final", label: t("final") },
        ]}
      />
      <LongTextField id={`${idPrefix}-assessmentText`} label={t("assessmentText")} required={value.assessmentType === "final"} disabled={disabled} error={errors["assessment.assessmentText"]} value={value.assessmentText} onValue={(v) => set({ assessmentText: v })} />
      <LongTextField id={`${idPrefix}-uncertainty`} label={t("uncertainty")} rows={3} disabled={disabled} value={value.uncertaintyNote} onValue={(v) => set({ uncertaintyNote: v })} />
      <LongTextField
        id={`${idPrefix}-differentials`}
        label={t("differentials")}
        rows={3}
        disabled={disabled}
        value={(value.differentials ?? []).join("\n")}
        onValue={(v) => set({ differentials: v.split("\n").slice(0, 20) })}
      />
      <LongTextField id={`${idPrefix}-redFlags`} label={t("redFlags")} rows={2} disabled={disabled} value={value.redFlags} onValue={(v) => set({ redFlags: v })} />
      <LongTextField id={`${idPrefix}-decision`} label={t("decision")} rows={2} disabled={disabled} value={value.clinicianDecision} onValue={(v) => set({ clinicianDecision: v })} />
    </div>
  );
}

// ---- Step 3 ----------------------------------------------------------------------------------
export function PrescriptionForm({ value, onChange, disabled, idPrefix, errors, allergyFactVersions }: StepProps<PrescriptionStep> & { errors: Record<string, string>; allergyFactVersions: string[] }) {
  const t = useTranslations("clinical.prescription");
  const tc = useTranslations("common.actions");
  const [pendingMode, setPendingMode] = useState<{ mode: Prescription["mode"]; count: number } | null>(null);
  const p = value.prescription;
  const items: MedicineLine[] = p.mode === "medicines" ? p.items : [];
  const nameOf = (m: MedicineLine, i: number) => m.name.trim() || t("unnamed", { number: i + 1 });

  const requestMode = (mode: Prescription["mode"]) => {
    const change = changePrescriptionMode(value, mode);
    if (change.discardsItems > 0) setPendingMode({ mode, count: change.discardsItems });
    else onChange(change.content);
  };

  return (
    <div className="grid gap-8">
      <ChoiceField
        id={`${idPrefix}-mode`}
        legend={t("modeLabel")}
        disabled={disabled}
        error={errors["prescription.mode"]}
        value={p.mode === "unset" ? undefined : p.mode}
        onValue={requestMode}
        options={[
          { value: "none", label: t("none") },
          { value: "medicines", label: t("medicines") },
        ]}
      />
      <Dialog open={pendingMode !== null} onOpenChange={(o) => (o ? undefined : setPendingMode(null))}>
        <DialogContent role="alertdialog">
          <DialogTitle>{t("discardTitle")}</DialogTitle>
          <DialogDescription>{t("discardBody", { count: pendingMode?.count ?? 0 })}</DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPendingMode(null)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingMode) onChange(changePrescriptionMode(value, pendingMode.mode).content);
                setPendingMode(null);
              }}
            >
              {t("discardConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {p.mode === "none" ? (
        <TextField id={`${idPrefix}-noneNote`} label={t("noneNote")} maxLength={1000} disabled={disabled} value={p.note} onValue={(v) => onChange({ ...value, prescription: { mode: "none", note: v } })} />
      ) : null}

      {p.mode === "medicines" ? (
        <div id={`${idPrefix}-items`} tabIndex={-1} className="grid gap-6">
          {errors["prescription.items"] ? <p className="text-sm font-medium text-danger">{errors["prescription.items"]}</p> : null}
          <ol className="grid gap-6">
            {items.map((m, i) => (
              <li key={m.key} className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">{t("line", { number: i + 1 })}</h3>
                  <div className="flex gap-1">
                    <Button variant="quiet" size="icon" aria-label={t("moveUp", { name: nameOf(m, i) })} disabled={disabled || i === 0} onClick={() => onChange(moveMedicineLine(value, m.key, -1))}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button variant="quiet" size="icon" aria-label={t("moveDown", { name: nameOf(m, i) })} disabled={disabled || i === items.length - 1} onClick={() => onChange(moveMedicineLine(value, m.key, 1))}>
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button variant="quiet" size="icon" aria-label={t("removeMedicine", { name: nameOf(m, i) })} disabled={disabled} onClick={() => onChange(removeMedicineLine(value, m.key))}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField id={`${idPrefix}-med-${m.key}-name`} label={t("name")} required maxLength={200} disabled={disabled} error={!m.name.trim() && errors["prescription.itemName"] ? t("nameRequired") : undefined} value={m.name} onValue={(v) => onChange(updateMedicineLine(value, m.key, { name: v }))} />
                  <TextField id={`${idPrefix}-med-${m.key}-strength`} label={t("strength")} maxLength={200} disabled={disabled} value={m.formulationStrength} onValue={(v) => onChange(updateMedicineLine(value, m.key, { formulationStrength: v }))} />
                  <TextField id={`${idPrefix}-med-${m.key}-dose`} label={t("dose")} maxLength={200} disabled={disabled} value={m.dose} onValue={(v) => onChange(updateMedicineLine(value, m.key, { dose: v }))} />
                  <TextField id={`${idPrefix}-med-${m.key}-route`} label={t("route")} maxLength={100} disabled={disabled} value={m.route} onValue={(v) => onChange(updateMedicineLine(value, m.key, { route: v }))} />
                  <TextField id={`${idPrefix}-med-${m.key}-frequency`} label={t("frequency")} maxLength={200} disabled={disabled} value={m.frequency} onValue={(v) => onChange(updateMedicineLine(value, m.key, { frequency: v }))} />
                  <TextField id={`${idPrefix}-med-${m.key}-duration`} label={t("duration")} maxLength={200} disabled={disabled} value={m.duration} onValue={(v) => onChange(updateMedicineLine(value, m.key, { duration: v }))} />
                  <TextField id={`${idPrefix}-med-${m.key}-quantity`} label={t("quantity")} maxLength={100} disabled={disabled} value={m.quantity} onValue={(v) => onChange(updateMedicineLine(value, m.key, { quantity: v }))} />
                </div>
                <LongTextField id={`${idPrefix}-med-${m.key}-instructions`} label={t("instructions")} rows={2} maxLength={1000} disabled={disabled} value={m.instructions} onValue={(v) => onChange(updateMedicineLine(value, m.key, { instructions: v }))} />
              </li>
            ))}
          </ol>
          <div>
            <Button id={`${idPrefix}-add`} variant="secondary" disabled={disabled} onClick={() => onChange(addMedicineLine(value, defaultKeyFactory()))}>
              <Plus aria-hidden />
              {t("addMedicine")}
            </Button>
          </div>
          <FormSection legend={t("allergyTitle")}>
            {value.allergyReview && !value.allergyReview.acknowledged ? <p className="text-sm text-warning-text">{t("allergyReset")}</p> : null}
            <CheckField
              id={`${idPrefix}-allergyReview`}
              label={t("allergyReview")}
              disabled={disabled}
              error={errors["prescription.allergyReview"]}
              checked={!!value.allergyReview?.acknowledged}
              onChecked={(c) => onChange(c ? acknowledgeAllergyReview(value, allergyFactVersions) : { ...value, allergyReview: { acknowledged: false } })}
            />
          </FormSection>
        </div>
      ) : null}

      <TestsAndReferrals value={value} onChange={onChange} disabled={disabled} idPrefix={idPrefix} />
    </div>
  );
}

function TestsAndReferrals({ value, onChange, disabled, idPrefix }: StepProps<PrescriptionStep>) {
  const t = useTranslations("clinical.prescription");
  const rows: TestOrReferral[] = value.testsAndReferrals ?? [];
  const add = (kind: TestOrReferral["kind"]) => onChange(addTestOrReferral(value, { key: defaultKeyFactory(), kind, description: "" }));
  return (
    <FormSection legend={t("testsTitle")}>
      <ul className="grid gap-4">
        {rows.map((r) => (
          <li key={r.key} className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                id={`${idPrefix}-tr-${r.key}`}
                label={t("testDescription", { kind: t(`testKind.${r.kind}`) })}
                maxLength={500}
                disabled={disabled}
                value={r.description}
                onValue={(v) => onChange({ ...value, testsAndReferrals: rows.map((x) => (x.key === r.key ? { ...x, description: v } : x)) })}
              />
            </div>
            <Button variant="quiet" size="icon" aria-label={t("removeTest", { kind: t(`testKind.${r.kind}`) })} disabled={disabled} onClick={() => onChange(removeTestOrReferral(value, r.key))}>
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" disabled={disabled} onClick={() => add("test")}>
          <Plus aria-hidden />
          {t("addTest")}
        </Button>
        <Button variant="secondary" disabled={disabled} onClick={() => add("referral")}>
          <Plus aria-hidden />
          {t("addReferral")}
        </Button>
      </div>
    </FormSection>
  );
}

// ---- Step 4 ----------------------------------------------------------------------------------
export function CareForm({ value, onChange, disabled, idPrefix, errors }: StepProps<CareStep> & { errors: Record<string, string> }) {
  const t = useTranslations("clinical.care");
  const f = value.followUp;
  return (
    <div className="grid gap-6">
      <LongTextField id={`${idPrefix}-advice`} label={t("advice")} rows={5} disabled={disabled} value={value.advice} onValue={(v) => onChange({ ...value, advice: v })} />
      <LongTextField id={`${idPrefix}-redFlags`} label={t("redFlags")} rows={3} maxLength={2000} disabled={disabled} value={value.redFlagsAdvice} onValue={(v) => onChange({ ...value, redFlagsAdvice: v })} />
      <ChoiceField
        id={`${idPrefix}-followUp`}
        legend={t("followUp")}
        disabled={disabled}
        error={errors["care.followUp"]}
        value={f && f.mode !== "unset" ? f.mode : undefined}
        onValue={(mode) => onChange(setFollowUp(value, mode === "recommended" ? { mode, date: f?.mode === "recommended" ? f.date : undefined, note: f?.mode === "recommended" ? f.note : undefined } : { mode }))}
        options={[
          { value: "not_required", label: t("followUpNotRequired") },
          { value: "recommended", label: t("followUpRecommended") },
        ]}
      />
      {f?.mode === "recommended" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField id={`${idPrefix}-followUpDate`} label={t("followUpDate")} disabled={disabled} value={f.date} onValue={(v) => onChange(setFollowUp(value, { ...f, date: v }))} />
          <TextField id={`${idPrefix}-followUpNote`} label={t("followUpNote")} maxLength={1000} disabled={disabled} value={f.note} onValue={(v) => onChange(setFollowUp(value, { ...f, note: v }))} />
        </div>
      ) : null}
    </div>
  );
}
