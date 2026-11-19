import { CalendarClock, Home, MapPin, Star, Video, Building2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatNumber, formatPaise, type Locale } from "@/lib/format";
import type { DoctorResult } from "@/modules/providers/doctor-search";

const MODE_ICON = { home_visit: Home, clinic: Building2, video: Video } as const;

export function doctorInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]?.toUpperCase() ?? "").join("");
}
/** Public booking entry: public IDs and the coarse PIN only. The wizard re-checks everything server-side. */
export function doctorBookHref(doctor: Pick<DoctorResult, "providerId" | "serviceId" | "location">): string | null {
  if (!doctor.location) return null;
  return "/patient/book?" + new URLSearchParams({ providerId: doctor.providerId, serviceId: doctor.serviceId });
}

/** Result card. Rating renders only when the server sends real aggregated reviews; there is no placeholder. */
export function DoctorCard({ doctor, headingLevel = "h3" }: { doctor: DoctorResult; headingLevel?: "h2" | "h3" }) {
  const t = useTranslations("booking");
  const locale = useLocale() as Locale;
  const Heading = headingLevel;
  const full = doctor.openSlots === 0;
  const href = doctorBookHref(doctor);
  const languages = doctor.languages.map(code => t(`filters.languages.${code}`)).join(", ");
  return (
    <article className="grid gap-5 rounded-lg border border-border bg-surface p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_15rem]"
      data-testid="doctor-card" data-synthetic={doctor.synthetic || undefined}>
      <span role="img" aria-label={t("card.initialsLabel", { name: doctor.displayName })}
        className="inline-flex size-16 items-center justify-center rounded-full bg-mist font-display text-xl font-medium text-forest">
        {doctorInitials(doctor.displayName)}
      </span>
      <div className="grid min-w-0 content-start gap-2">
        <Heading className="text-xl font-semibold text-ink">
          <Link href={`/doctors/${doctor.providerId}`} className="rounded-sm hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {doctor.displayName}
          </Link>
        </Heading>
        <p className="text-base text-forest">{doctor.specialities.map(key => t(`search.specialities.${key}`)).join(" · ")}</p>
        <p className="text-sm text-muted">
          {[doctor.degrees.join(", "), doctor.experienceYears === null ? t("card.experienceUnknown") : t("card.experience", { years: doctor.experienceYears })].filter(Boolean).join(" · ")}
        </p>
        {languages ? <p className="text-sm text-muted">{t("card.speaks", { languages })}</p> : null}
        <ul className="flex flex-wrap gap-2 pt-1" aria-label={t("filters.mode")}>
          {doctor.modes.map(mode => {
            const Icon = MODE_ICON[mode];
            return <li key={mode} className="inline-flex items-center gap-1.5 rounded-sm bg-paper-deep px-2 py-1 text-sm text-ink"><Icon aria-hidden className="size-4 text-forest" />{t(`filters.modes.${mode}`)}</li>;
          })}
        </ul>
        <p className="flex items-start gap-1.5 pt-1 text-sm text-muted">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {doctor.location ? [doctor.clinicName, doctor.location.locality, doctor.location.city].filter(Boolean).join(", ") : t("card.noLocation")}
            {doctor.distanceKm !== null ? <> · <span className="tabular">{t("card.distance", { km: formatNumber(doctor.distanceKm, locale) })}</span></> : null}
          </span>
        </p>
        {doctor.rating ? (
          <p className="flex items-center gap-1.5 text-sm text-ink">
            <Star aria-hidden className="size-4 text-warning-text" />
            {t("card.rating", { average: formatNumber(doctor.rating.average, locale), count: doctor.rating.count })}
          </p>
        ) : null}
      </div>
      <div className="grid content-start gap-3 border-t border-border pt-4 sm:col-span-2 lg:col-span-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <p className="text-lg font-semibold text-ink tabular">{t("card.fee", { amount: formatPaise(doctor.feePaise, locale) })}</p>
        <div>
          {full ? <StatusBadge tone="neutral" label={t("card.fullyBooked")} />
            : doctor.openSlots === null ? <StatusBadge tone="neutral" label={t("card.slotsUnknown")} />
            : <StatusBadge tone="success" label={t("card.openSlots", { count: doctor.openSlots })} />}
        </div>
        <p className="flex items-start gap-1.5 text-sm text-muted">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {doctor.nextSlotAt ? t("card.nextSlot", { time: formatDateTime(doctor.nextSlotAt, locale) }) : t("card.noNextSlot")}
        </p>
        <div className="grid gap-2">
          {href && !full ? (
            <Button asChild><Link href={href}>{t("card.book")}</Link></Button>
          ) : (
            <>
              <Button type="button" disabled aria-describedby={`book-reason-${doctor.providerId}`}>{t("card.book")}</Button>
              <p id={`book-reason-${doctor.providerId}`} className="text-sm text-muted">{full ? t("card.bookDisabledFull") : t("card.bookDisabledLocation")}</p>
            </>
          )}
          <Button asChild variant="secondary"><Link href={`/doctors/${doctor.providerId}`}>{t("card.viewProfile")}</Link></Button>
        </div>
        <p className="text-xs text-muted">{t("card.manualAcceptance")}</p>
      </div>
    </article>
  );
}
