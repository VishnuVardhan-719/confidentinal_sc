"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { translateKey, type RootTranslator } from "@/components/auth/message-key";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { coverageDecisionAction, reviewDecisionAction, startReviewAction } from "@/modules/verification/actions";
import type { DecisionState } from "@/modules/verification/flows";

const IDLE: DecisionState = { status: "idle" };

const ACTIONS = {
  review: reviewDecisionAction,
  start: startReviewAction,
  coverage: coverageDecisionAction,
} as const;

/**
 * Reason + explicit confirmation dialog for admin decisions (provider review, start review,
 * coverage). Hidden fields carry only record IDs, the decision and the version the admin saw;
 * the server re-authorizes and re-checks the transition. A stale version returns a conflict.
 */
export function AdminDecision({
  kind,
  label,
  subject,
  fields,
  locale,
  confirmRequired = true,
  tone = "primary",
}: {
  kind: keyof typeof ACTIONS;
  label: string;
  /** Record name for the dialog title (plain text). */
  subject: string;
  fields: Record<string, string | number>;
  locale: string;
  confirmRequired?: boolean;
  tone?: "primary" | "secondary" | "danger";
}) {
  const t = useTranslations("onboarding.adminReview");
  const root = useTranslations() as unknown as RootTranslator;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState<DecisionState, FormData>(async (prev, fd) => {
    const next = await ACTIONS[kind](prev, fd);
    if (next.status === "done") {
      // Close and re-read the record: the decisions offered follow the new server status.
      setOpen(false);
      setConfirmed(false);
      router.refresh();
    }
    return next;
  }, IDLE);
  const id = useId();

  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const reasonError = fieldErrors.reason ? translateKey(root, fieldErrors.reason, "onboarding", "onboarding.fieldErrors.invalid") : undefined;
  const message =
    state.status === "invalid" || state.status === "conflict" || state.status === "gated" || state.status === "error"
      ? translateKey(root, state.errorKey, "onboarding", "errors.api.generic")
      : null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) setConfirmed(false);
        }}
      >
        <DialogTrigger asChild>
          <Button variant={tone === "danger" ? "danger" : tone}>{label}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>{t("decision.dialogTitle", { action: label, name: subject })}</DialogTitle>
          <DialogDescription>{t("decision.dialogBody")}</DialogDescription>
          <form action={action} className="grid gap-5">
            <input type="hidden" name="locale" value={locale} />
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={String(value)} />
            ))}
            {message ? (
              <Notice role="alert" tone={state.status === "gated" ? "neutral" : "danger"}>
                {message}
              </Notice>
            ) : null}
            <div className="grid gap-2">
              <label htmlFor={`${id}-reason`} className="text-base font-semibold text-ink">
                {t("decision.reason")}
              </label>
              <p id={`${id}-reason-hint`} className="text-sm text-muted">
                {t("decision.reasonHint")}
              </p>
              {reasonError ? (
                <p id={`${id}-reason-error`} className="text-sm font-medium text-danger">
                  {reasonError}
                </p>
              ) : null}
              <Textarea
                id={`${id}-reason`}
                name="reason"
                required
                maxLength={1000}
                rows={3}
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ""}`}
              />
            </div>
            {confirmRequired ? (
              <label className="flex items-start gap-3 text-base text-ink">
                <input
                  type="checkbox"
                  name="confirm"
                  className="mt-1 size-5 shrink-0 accent-forest"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>{t("decision.confirmCheck")}</span>
              </label>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                {t("decision.cancel")}
              </Button>
              <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} disabled={pending || (confirmRequired && !confirmed)} aria-busy={pending}>
                {pending ? t("decision.working") : t("decision.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Document viewer stays gated: no signed URL is requested or rendered (I02 signing disabled). */
export function GatedDocumentViewer() {
  const t = useTranslations("onboarding.adminReview.detail");
  const [shown, setShown] = useState(false);
  return (
    <div className="grid gap-2">
      <div>
        <Button variant="secondary" onClick={() => setShown(true)} aria-expanded={shown}>
          {t("viewDocument")}
        </Button>
      </div>
      {shown ? (
        <p role="status" className="text-sm text-muted">
          {t("viewerGated")}
        </p>
      ) : null}
    </div>
  );
}
