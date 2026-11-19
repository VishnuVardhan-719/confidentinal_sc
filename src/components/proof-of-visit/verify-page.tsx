import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { GateNotice } from "@/components/shared/gate-notice";
import { PageHeader } from "@/components/shared/page-header";
import { isFixtureMode } from "@/lib/api/mode";
import { isClinicalEnabled } from "@/modules/clinical/gate";

/** Shared frame for /verify and /verify/[code]: header, synthetic label, gate. */
export async function VerifyPageFrame({ children }: { children: ReactNode }) {
  const [t, tc] = await Promise.all([getTranslations("verify"), getTranslations("clinical")]);
  return (
    <div className="mx-auto grid w-full max-w-content gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {isFixtureMode() ? <FixtureNotice /> : null}
      <PageHeader title={t("title")} description={t("description")} />
      {isClinicalEnabled() ? (
        children
      ) : (
        <GateNotice feature="clinical" title={t("gatedTitle")}>
          {tc("gate.consultation")}
        </GateNotice>
      )}
    </div>
  );
}

export const verifyMetadata = async () => {
  const t = await getTranslations("verify");
  // No code in the title; no referrer so the code is not passed to other sites.
  return { title: t("title"), robots: { index: false, follow: false }, referrer: "no-referrer" as const };
};
