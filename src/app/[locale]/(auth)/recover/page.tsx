import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthFrame, AuthHeading } from "@/components/auth/auth-frame";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.recover");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Password recovery. I01 has no recovery contract yet, so this page says so honestly and points
 * to support instead of pretending to send a reset link (docs/frontend/REQUESTS.md R-FE06-01).
 */
export default function RecoverPage() {
  const t = useTranslations("auth.recover");
  return (
    <AuthFrame>
      <AuthHeading title={t("title")} />
      <Notice tone="neutral" icon="lock" title={t("unavailableTitle")}>
        {t("unavailableBody")}
      </Notice>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/contact">{t("contact")}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/login">{t("back")}</Link>
        </Button>
      </div>
    </AuthFrame>
  );
}
