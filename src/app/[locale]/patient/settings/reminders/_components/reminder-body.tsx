import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { RetryAction } from "@/components/shared/retry-action";
import type { ApiResult } from "@/lib/api/result";
import { reminderPrefsSchema, type ReminderPrefs } from "@/modules/reminder-prefs";

export type ReminderPageState = { kind: "ready"; prefs: ReminderPrefs } | { kind: "gated" } | { kind: "denied" } | { kind: "error"; code: string };

/** Untrusted adapter result -> page state. A body that fails the schema is an error, never a form. */
export function reminderPageState(result: ApiResult<unknown>): ReminderPageState {
  if (!result.ok) {
    if (result.error.code === "gated") return { kind: "gated" };
    if (result.error.code === "forbidden") return { kind: "denied" };
    return { kind: "error", code: result.error.code };
  }
  const parsed = reminderPrefsSchema.safeParse(result.data);
  return parsed.success ? { kind: "ready", prefs: parsed.data } : { kind: "error", code: "unavailable" };
}

/**
 * Reminder preferences body below the page header: gated, denied, error, or the form. The form is a
 * client island passed in by the page (`renderForm`), so this view stays renderable in tests.
 */
export function ReminderBody({ state, dashboardAction, renderForm }: { state: ReminderPageState; dashboardAction: ReactNode; renderForm: (prefs: ReminderPrefs) => ReactNode }) {
  const t = useTranslations("patientAccount.reminders");
  if (state.kind === "gated") return <GateNotice reason="contract_pending" action={dashboardAction}>{t("state.gated")}</GateNotice>;
  if (state.kind === "denied") return <Notice tone="neutral" icon="lock" title={t("state.denied")} action={dashboardAction} />;
  if (state.kind === "error") return <InlineError code={state.code} action={<RetryAction />} />;
  return <>{renderForm(state.prefs)}</>;
}
