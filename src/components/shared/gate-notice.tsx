import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { FeatureFlag } from "@/lib/feature-flags";
import { Notice } from "./notice";

type GateSource =
  /** A server-side feature flag (isEnabled) is off. */
  | { feature: FeatureFlag; reason?: never }
  /**
   * No backend contract exists yet (the module returns fail("gated")). Same honest "not available"
   * UI, without naming a flag.
   */
  | { reason: "contract_pending"; feature?: never };

/**
 * Rendered when something is switched off or not built yet. Explains it is not available; never
 * implies it works. The server still refuses the feature on direct requests.
 */
export function GateNotice({
  title,
  children,
  action,
  className,
  ...source
}: GateSource & {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("common.gate");
  const isFlag = "feature" in source && source.feature !== undefined;
  return (
    <Notice
      tone="neutral"
      icon="lock"
      data-gate={isFlag ? source.feature : "contract_pending"}
      title={title ?? (isFlag ? t("title", { feature: t(`features.${source.feature}`) }) : t("pendingTitle"))}
      action={action}
      className={className}
    >
      {children ?? (isFlag ? t("body") : t("pendingBody"))}
    </Notice>
  );
}
