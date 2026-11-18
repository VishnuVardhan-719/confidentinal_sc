import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { errorMessageKey } from "./error-message";
import { Notice } from "./notice";

/**
 * Persistent inline error for a failed action or load. Pass an ApiErrorCode to get the localized
 * message; raw backend text is never rendered.
 */
export function InlineError({
  code,
  message,
  action,
  id,
  className,
}: {
  code?: string;
  /** Already-localized override. */
  message?: string;
  action?: ReactNode;
  id?: string;
  className?: string;
}) {
  const t = useTranslations("errors");
  return (
    <Notice id={id} role="alert" tone="danger" title={t("inlineTitle")} action={action} className={className}>
      {message ?? t(`api.${errorMessageKey(code)}`)}
    </Notice>
  );
}
