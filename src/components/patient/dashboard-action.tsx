import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Next step for gated or denied patient pages: back to the patient overview. */
export async function DashboardAction() {
  const t = await getTranslations("patient.shell");
  return (
    <Button asChild variant="secondary">
      <Link href="/patient/dashboard">{t("toDashboard")}</Link>
    </Button>
  );
}
