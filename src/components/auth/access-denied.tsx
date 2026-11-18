import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { DeniedReason } from "@/modules/auth/guard";

/**
 * Minimal access-denied state (FRONTEND_MASTER s5): says nothing about whether the requested
 * record or workspace exists. Rendered by pages when requireRole/requireSession deny.
 */
export async function AccessDenied({ reason }: { reason: DeniedReason }) {
  const t = await getTranslations("auth.denied");
  return (
    <section aria-labelledby="access-denied-title" className="grid max-w-2xl gap-5 py-10" data-testid="private-access-denied">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-mist text-forest">
        <ShieldAlert aria-hidden className="size-6" />
      </span>
      <h1 id="access-denied-title" className="font-display text-3xl font-medium text-ink">
        {t("title")}
      </h1>
      <p className="measure text-lg text-muted">{t(reason)}</p>
      <div className="flex flex-wrap gap-3">
        {reason === "forbidden" ? (
          <Button asChild>
            <Link href="/workspace/select">{t("switchWorkspace")}</Link>
          </Button>
        ) : null}
        <Button asChild variant="secondary">
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </section>
  );
}
