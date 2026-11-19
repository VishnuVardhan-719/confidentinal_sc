import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { badgeFor, type Tk } from "@/components/clinical/kit";
import { Link } from "@/i18n/navigation";
import type { BookingBadges } from "./booking-detail-logic";

export type BookingRowData = {
  id: string;
  reference: string | null;
  category: string;
  start: string;
  price: string;
  badges: BookingBadges;
};

const CATEGORIES = ["doctor", "lab", "ambulance", "caretaker"] as const;

/** One booking in the list. Booking, visit, payment and clinical states are shown side by side, never merged. */
export async function BookingRow({ row, tk }: { row: BookingRowData; tk: Tk }) {
  const t = await getTranslations("patient.dashboard.card");
  const category = CATEGORIES.find((c) => c === row.category);
  const statuses = [
    { label: t("booking"), descriptor: row.badges.booking },
    ...(row.badges.visit ? [{ label: t("visit"), descriptor: row.badges.visit }] : []),
    { label: t("payment"), descriptor: row.badges.payment },
    { label: t("clinical"), descriptor: row.badges.clinical },
  ];
  return (
    <li className="grid gap-4 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-forest/60 sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="grid gap-1">
        <p className="font-semibold">{category ? t(`category.${category}`) : row.category}</p>
        <p className="tabular">{row.start}</p>
        <p className="text-sm text-muted tabular">
          {row.reference ? t("reference", { reference: row.reference }) : t("noReference")} · {t("price", { price: row.price })}
        </p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2" aria-label={t("statuses")}>
          {statuses.map((s) => (
            <div key={s.label} className="flex flex-wrap items-center gap-2">
              <dt className="text-sm text-muted">{s.label}</dt>
              <dd>
                <StatusBadge {...badgeFor(s.descriptor, tk)} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <Button asChild variant="secondary">
        <Link href={`/patient/bookings/${row.id}`}>
          {t("open")}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </li>
  );
}
