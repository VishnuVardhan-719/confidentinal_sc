"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useTrackedRun } from "@/components/admin/ops/use-tracked-run";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/modules/admin/action-result";
import { draftFromForm, validateEditorForm, type EditorField, type EditorForm } from "@/modules/content/editor";

type ErrorCode = "required" | "too_long" | "html_forbidden" | "unsafe_link" | "invalid";

export type CmsEditorLabels = {
  slug: string;
  slugHint: string;
  title: string;
  summary: string;
  body: string;
  bodyHint: string;
  question: string;
  answer: string;
  order: string;
  consentEvidence: string;
  consentHint: string;
  noIdentifiablePerson: string;
  save: string;
  saved: string;
  errors: Record<ErrorCode, string>;
};

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/**
 * CMS draft editor. Plain-text markup only; validated in the browser for quick
 * feedback and again by the server schema (no HTML, script or unsafe links).
 */
export function CmsEditorForm({
  initial,
  slugLocked,
  run,
  labels,
}: {
  initial: EditorForm;
  slugLocked: boolean;
  run: (form: { draft: unknown; idempotencyKey: string }) => Promise<ActionResult & { entryId?: string }>;
  labels: CmsEditorLabels;
}) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const key = useRef(newKey());
  const [form, setForm] = useState<EditorForm>(initial);
  const [errors, setErrors] = useState<Partial<Record<EditorField, ErrorCode>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { running, track } = useTrackedRun();
  const [refreshing, startTransition] = useTransition();
  const pending = running || refreshing;
  const fid = (f: EditorField) => `${id}-${f}`;
  const set = (patch: Partial<EditorForm>) => setForm((f) => ({ ...f, ...patch }));
  const err = (f: EditorField) => (errors[f] ? labels.errors[errors[f] as ErrorCode] : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setServerError(null);
    setAttempt((n) => n + 1);
    const local = validateEditorForm(form);
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }
    setErrors({});
    // Saving is tracked from before the action starts until navigation/refetch begins.
    const result = await track(async () => {
      const r = await run({ draft: draftFromForm(form), idempotencyKey: key.current });
      if (r.ok) {
        key.current = newKey();
        toast({ title: labels.saved, tone: "success" });
        startTransition(() => {
          if (!slugLocked && r.entryId) router.push(`/admin/cms/${encodeURIComponent(r.entryId)}?locale=${form.locale}`);
          else router.refresh();
        });
      }
      return r;
    });
    if (result && !result.ok) setServerError(result.code);
  }

  const order: EditorField[] = ["slug", "title", "summary", "bodyText", "question", "answerText", "order", "consentEvidenceId", "noIdentifiablePerson", "form"];
  const summary: SummaryError[] = order.filter((f) => errors[f]).map((f) => ({ fieldId: fid(f), message: labels.errors[errors[f] as ErrorCode] }));

  return (
    <form onSubmit={submit} noValidate className="grid max-w-3xl gap-5">
      {summary.length ? <ErrorSummary errors={summary} focusKey={attempt} /> : null}
      {serverError && serverError !== "validation" ? <InlineError code={serverError} /> : null}
      {serverError === "validation" ? <InlineError code="validation" /> : null}
      <Field id={fid("slug")} label={labels.slug} hint={labels.slugHint} error={err("slug")} required>
        {(p) => <Input {...p} value={form.slug} readOnly={slugLocked} onChange={(e) => set({ slug: e.target.value })} />}
      </Field>
      {form.kind === "faq" ? (
        <>
          <Field id={fid("question")} label={labels.question} error={err("question")} required>
            {(p) => <Input {...p} value={form.question} onChange={(e) => set({ question: e.target.value })} />}
          </Field>
          <Field id={fid("answerText")} label={labels.answer} hint={labels.bodyHint} error={err("answerText")} required>
            {(p) => <Textarea {...p} rows={8} value={form.answerText} onChange={(e) => set({ answerText: e.target.value })} />}
          </Field>
          <Field id={fid("order")} label={labels.order} error={err("order")} required>
            {(p) => <Input {...p} inputMode="numeric" value={form.order} onChange={(e) => set({ order: e.target.value })} />}
          </Field>
        </>
      ) : (
        <>
          <Field id={fid("title")} label={labels.title} error={err("title")} required>
            {(p) => <Input {...p} value={form.title} onChange={(e) => set({ title: e.target.value })} />}
          </Field>
          <Field id={fid("summary")} label={labels.summary} error={err("summary")}>
            {(p) => <Textarea {...p} rows={3} value={form.summary} onChange={(e) => set({ summary: e.target.value })} />}
          </Field>
          <Field id={fid("bodyText")} label={labels.body} hint={labels.bodyHint} error={err("bodyText")} required>
            {(p) => <Textarea {...p} rows={12} value={form.bodyText} onChange={(e) => set({ bodyText: e.target.value })} />}
          </Field>
          {form.kind === "story" ? (
            <>
              <Field id={fid("consentEvidenceId")} label={labels.consentEvidence} hint={labels.consentHint} error={err("consentEvidenceId")}>
                {(p) => <Input {...p} value={form.consentEvidenceId} onChange={(e) => set({ consentEvidenceId: e.target.value })} />}
              </Field>
              <label htmlFor={fid("noIdentifiablePerson")} className="flex min-h-target items-center gap-3 text-base text-ink">
                <input
                  id={fid("noIdentifiablePerson")}
                  type="checkbox"
                  className="size-5 accent-forest"
                  checked={form.noIdentifiablePerson}
                  onChange={(e) => set({ noIdentifiablePerson: e.target.checked })}
                />
                {labels.noIdentifiablePerson}
              </label>
            </>
          ) : null}
        </>
      )}
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {labels.save}
        </Button>
      </div>
    </form>
  );
}
