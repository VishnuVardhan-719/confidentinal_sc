import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { FeatureFlag } from "@/lib/feature-flags";
import { Notice } from "./notice";

/**
 * Rendered when a server-side feature flag (isEnabled) is off. Explains the feature is not available
 * yet; never implies it works. The server still refuses the feature on direct requests.
 */
export function GateNotice({
  feature,
  title,
  children,
  action,
  className,
}: {
  feature: FeatureFlag;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("common.gate");
  return (
    <Notice
      tone="neutral"
      icon="lock"
      data-gate={feature}
      title={title ?? t("title", { feature: t(`features.${feature}`) })}
      action={action}
      className={className}
    >
      {children ?? t("body")}
    </Notice>
  );
}
