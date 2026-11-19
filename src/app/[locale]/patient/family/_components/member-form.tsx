"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, fieldControlClass } from "@/components/ui/input";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { Link, useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { todayIst, validateFamilyInput } from "@/modules/family-members/schemas";
import { FAMILY_ISSUES, FAMILY_NAME_MAX, FAMILY_RELATIONS, type FamilyField, type FamilyIssue, type FamilyMember, type FamilyRelation } from "@/modules/family-members/types";

type Props =
  | { mode: "new"; member?: undefined; create: (input: unknown, key: string) => Promise<ApiResult<FamilyMember>> }
  | { mode: "edit"; member: FamilyMember; update: (id: string, input: unknown, version: number) => Promise<ApiResult<FamilyMember>> };

/**
 * Add or edit a family member. Validates on submit with the same rules as the server, lists errors
 * in an ErrorSummary that takes focus, and maps server field codes back onto the fields.
 */
export function MemberForm(props: Props) {
  const t = useTranslations("patientAccount.family");
  const router = useRouter();
  const base = useId();
  const ids: Record<FamilyField, string> = { displayName: `${base}-name`, relation: `${base}-relation`, dateOfBirth: `${base}-dob` };
  const [name, setName] = useState(props.member?.displayName ?? "");
  const [relation, setRelation] = useState<FamilyRelation | "">(props.member?.relation ?? "");
  const [dob, setDob] = useState(props.member?.dateOfBirth ?? "");
  const [errors, setErrors] = useState<SummaryError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One idempotency key per add intent; kept across retries.
  const key = useRef<string | null>(null);

  const fieldError = (f: FamilyField) => errors.find((e) => e.fieldId === ids[f])?.message;
  const toSummary = (issues: { field: FamilyField; code: FamilyIssue }[]) => issues.map((i) => ({ fieldId: ids[i.field], message: t(`form.errors.${i.code}`) }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = { displayName: name, relation, dateOfBirth: dob };
    const v = validateFamilyInput(input);
    setAttempt((a) => a + 1);
    setApiError(null);
    if (!v.ok) {
      setErrors(toSummary(v.issues));
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      let r: ApiResult<FamilyMember>;
      if (props.mode === "new") {
        key.current ??= globalThis.crypto.randomUUID();
        r = await props.create(v.data, key.current);
      } else {
        r = await props.update(props.member.id, v.data, props.member.version);
      }
      if (!r.ok) {
        const fields = r.error.fields ?? {};
        const issues = (Object.keys(ids) as FamilyField[])
          .filter((f) => (FAMILY_ISSUES as readonly string[]).includes(fields[f] ?? ""))
          .map((f) => ({ field: f, code: fields[f] as FamilyIssue }));
        if (r.error.code === "validation" && issues.length > 0) setErrors(toSummary(issues));
        else setApiError(r.error.code);
        return;
      }
      key.current = null;
      router.push(`/patient/family?status=${props.mode === "new" ? "added" : "updated"}`);
      router.refresh();
    } catch {
      setApiError("unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid max-w-form gap-6">
      <ErrorSummary errors={errors} focusKey={attempt} />
      <Field id={ids.displayName} label={t("form.name")} hint={t("form.nameHint")} required error={fieldError("displayName")}>
        {(control) => <Input {...control} name="displayName" autoComplete="off" maxLength={FAMILY_NAME_MAX + 20} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field id={ids.relation} label={t("form.relationLabel")} required error={fieldError("relation")}>
        {(control) => (
          <select {...control} name="relation" className={fieldControlClass} value={relation} onChange={(e) => setRelation(e.target.value as FamilyRelation | "")}>
            <option value="">{t("form.relationPlaceholder")}</option>
            {FAMILY_RELATIONS.map((r) => (
              <option key={r} value={r}>
                {t(`relation.${r}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field id={ids.dateOfBirth} label={t("form.dob")} hint={t("form.dobHint")} required error={fieldError("dateOfBirth")}>
        {(control) => <Input {...control} name="dateOfBirth" type="date" max={todayIst()} min="1900-01-01" value={dob} onChange={(e) => setDob(e.target.value)} className="max-w-56" />}
      </Field>
      {apiError === "conflict" ? (
        <Notice tone="warning">{props.mode === "new" ? t("form.limitReached") : t("form.conflict")}</Notice>
      ) : apiError ? (
        <InlineError code={apiError} />
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("form.saving") : props.mode === "new" ? t("form.save") : t("form.saveChanges")}
        </Button>
        <Button asChild variant="quiet">
          <Link href="/patient/family">{t("form.cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
