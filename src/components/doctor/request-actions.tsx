"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/input";
import { ConfirmDialog, type ConfirmResult } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { Notice } from "@/components/shared/notice";
import { useClinicalFormat } from "@/components/clinical/use-format";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { interpretCommand } from "@/modules/doctor/loaders";
import { DECLINE_REASON_LABEL_KEYS } from "@/modules/doctor/status";
import { DOCTOR_DECLINE_REASONS, type DeclineReason, type VersionResponse } from "@/modules/doctor/types";
import { outcomeMessageKey } from "./command-message";

type Actions = {
  accept: (bookingId: string, expectedVersion: number) => Promise<ApiResult<VersionResponse>>;
  decline: (bookingId: string, expectedVersion: number, reason: DeclineReason) => Promise<ApiResult<VersionResponse>>;
};

/**
 * Accept / decline with explicit confirmation. Nothing changes on screen until the server answers;
 * on conflict the page is refreshed and the reason explained (no duplicate booking).
 */
export function RequestActions({ bookingId, version, open, actions }: { bookingId: string; version: number; open: boolean; actions: Actions }) {
  const t = useTranslations("doctor.requests");
  const { tk } = useClinicalFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [reason, setReason] = useState<DeclineReason | "">("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [message, setMessage] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const reasonId = useId();

  const run = async (kind: "accept" | "decline", call: () => Promise<ApiResult<VersionResponse>>): Promise<ConfirmResult> => {
    const result = await call();
    const outcome = interpretCommand(result, kind);
    if (outcome.kind === "done") {
      setMessage({ tone: "info", text: kind === "accept" ? t("accept.done") : t("decline.done") });
      startTransition(() => (kind === "accept" ? router.push(`/doctor/visits/${bookingId}`) : router.refresh()));
      return { ok: true };
    }
    if (outcome.kind === "refresh") {
      setMessage({ tone: "warning", text: tk(outcomeMessageKey(outcome)) });
      startTransition(() => router.refresh());
      return { ok: true };
    }
    if (kind === "accept" && outcome.kind === "gated") {
      setMessage({ tone: "warning", text: t("accept.noResource") });
      return { ok: true };
    }
    return { ok: false, code: result.ok ? undefined : result.error.code };
  };

  return (
    <div className="grid gap-4">
      <div aria-live="polite">{message ? <Notice tone={message.tone}>{message.text}</Notice> : null}</div>
      {open ? (
        <div className="flex flex-wrap gap-3">
          <ConfirmDialog
            trigger={<Button>{t("accept.action")}</Button>}
            title={t("accept.title")}
            description={t("accept.body")}
            confirmLabel={t("accept.confirm")}
            onConfirm={() => run("accept", () => actions.accept(bookingId, version))}
          />
          <ConfirmDialog
            trigger={<Button variant="secondary">{t("decline.action")}</Button>}
            title={t("decline.title")}
            tone="danger"
            confirmLabel={t("decline.confirm")}
            description={
              <div className="grid gap-4">
                <p>{t("decline.body")}</p>
                <Field id={reasonId} label={t("decline.reasonLabel")} required error={reasonError}>
                  {(control) => (
                    <select
                      {...control}
                      className={fieldControlClass}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value as DeclineReason | "");
                        setReasonError(undefined);
                      }}
                    >
                      <option value="">{t("decline.reasonPlaceholder")}</option>
                      {DOCTOR_DECLINE_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {tk(DECLINE_REASON_LABEL_KEYS[r])}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
            }
            onConfirm={async () => {
              if (!reason) {
                setReasonError(t("decline.reasonRequired"));
                document.getElementById(reasonId)?.focus();
                return { ok: false, code: "validation" };
              }
              return run("decline", () => actions.decline(bookingId, version, reason));
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
