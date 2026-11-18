"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { SummaryError } from "@/components/shared/error-summary";
import { translateKey, type RootTranslator } from "@/components/auth/message-key";
import type { SaveState } from "@/modules/onboarding/wizard";
import type { EvidenceOption, RenderContext } from "./field-renderer";
import { fieldDomId } from "./form-spec";

/**
 * Shared glue between a SaveState from a server action and the spec-driven form: localized
 * field errors by exact path, the ErrorSummary list, and a render context.
 */
export function useSpecFormContext(state: SaveState, disabled: boolean, evidence: readonly EvidenceOption[] = []) {
  const t = useTranslations("onboarding");
  const root = useTranslations() as unknown as RootTranslator;
  const fieldErrors = useMemo(() => (state.status === "invalid" ? state.fieldErrors : {}), [state]);

  const ctx: Omit<RenderContext, "onChange"> = useMemo(
    () => ({
      tr: (key, values) => (t as unknown as RootTranslator)(key as never, values),
      has: (key) => (t as unknown as RootTranslator).has(key as never),
      errorAt: (path) => (fieldErrors[path] ? translateKey(root, fieldErrors[path], "onboarding", "onboarding.fieldErrors.invalid") : undefined),
      evidence,
      disabled,
    }),
    [t, root, fieldErrors, evidence, disabled],
  );

  const summary: SummaryError[] = Object.entries(fieldErrors).map(([path, key]) => ({
    fieldId: fieldDomId(path),
    message: translateKey(root, key, "onboarding", "onboarding.fieldErrors.invalid"),
  }));

  const statusText =
    state.status === "invalid" || state.status === "conflict" || state.status === "gated" || state.status === "error"
      ? translateKey(root, state.errorKey, "onboarding", "errors.api.generic", state.status === "error" && state.retryAfterSeconds ? { seconds: state.retryAfterSeconds } : undefined)
      : null;

  return { ctx, summary, statusText };
}
