import { Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";

/**
 * Shown first on every ambulance transfer page. These pages only book scheduled, non-emergency transfers;
 * an emergency must go to 112 directly, without an account, payment or waiting for a reply.
 */
export async function EmergencyBanner() {
  const t = await getTranslations("services.ambulance");
  return (
    <Notice tone="danger" title={t("emergencyTitle")} data-testid="emergency-banner"
      action={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="danger" size="lg"><a href="tel:112"><Phone aria-hidden />{t("emergencyCall")}</a></Button>
          <Button asChild variant="secondary" size="lg"><a href="tel:108"><Phone aria-hidden />{t("emergencyCallAmbulance")}</a></Button>
        </div>
      }>
      {t("emergencyBody")}
    </Notice>
  );
}
