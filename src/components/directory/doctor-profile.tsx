import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Container } from "@/components/public/layout";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { GateNotice } from "@/components/shared/gate-notice";
import { Notice } from "@/components/shared/notice";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatPaise, type Locale } from "@/lib/format";
import { createDoctorSearchApi, type DoctorSearchApi } from "@/modules/providers/doctor-api";
import { doctorBookHref, doctorInitials } from "./doctor-card";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
      <dt className="text-base font-semibold text-ink">{label}</dt>
      <dd className="text-base text-ink">{children}</dd>
    </div>
  );
}

/** Public subset only: no phone, address line, documents or patient data. Unknown or ineligible IDs are not-found. */
export async function DoctorProfile({ params, api = createDoctorSearchApi() }: { params: Promise<{ id: string }>; api?: Pick<DoctorSearchApi, "get"> }) {
  const { id } = await params;
  await connection();
  const t = await getTranslations("booking");
  const locale = (await getLocale()) as Locale;
  let result;
  try { result = await api.get(id); } catch { result = { ok: false as const, error: { code: "unavailable" as const } }; }
  if (!result.ok && ["not_found", "validation", "forbidden"].includes(result.error.code)) notFound();
  const back = <Button asChild variant="quiet"><Link href="/doctors"><ArrowLeft aria-hidden />{t("profile.back")}</Link></Button>;
  if (!result.ok) {
    return (
      <Container className="grid gap-6 py-12">
        {back}
        {/* One h1 on every state, including gated and error (a11y; the profile name is unknown here). */}
        <h1 className="font-display text-3xl font-medium text-ink">{t("search.title")}</h1>
        {result.error.code === "gated"
          ? <GateNotice reason="contract_pending" title={t("results.gatedTitle")}>{t("results.gatedBody")}</GateNotice>
          : <Notice tone="danger" title={t("results.errorTitle")}>{t("results.errorBody")}</Notice>}
      </Container>
    );
  }
  const doctor = result.data;
  const full = doctor.openSlots === 0;
  const href = doctorBookHref(doctor);
  return (
    <Container className="grid gap-8 pt-8 pb-20">
      <div>{back}</div>
      {doctor.synthetic ? <FixtureNotice /> : null}
      <header className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <span role="img" aria-label={t("card.initialsLabel", { name: doctor.displayName })}
          className="inline-flex size-20 items-center justify-center rounded-full bg-mist font-display text-2xl font-medium text-forest">{doctorInitials(doctor.displayName)}</span>
        <div className="grid gap-2">
          <h1 className="font-display text-[clamp(2rem,1.5rem+2vw,3rem)] leading-tight font-medium text-ink">{doctor.displayName}</h1>
          <p className="text-lg text-forest">{doctor.specialities.map(key => t(`search.specialities.${key}`)).join(" · ")}</p>
        </div>
      </header>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="profile-about">
          <h2 id="profile-about" className="text-xl font-semibold text-ink">{t("profile.about")}</h2>
          <dl className="mt-2 border-t border-border">
            <Fact label={t("profile.qualifications")}>
              {[doctor.degrees.join(", "), doctor.experienceYears === null ? t("card.experienceUnknown") : t("card.experience", { years: doctor.experienceYears })].filter(Boolean).join(" · ")}
            </Fact>
            <Fact label={t("profile.languages")}>{doctor.languages.map(code => t(`filters.languages.${code}`)).join(", ")}</Fact>
            <Fact label={t("profile.consultation")}>{doctor.modes.map(mode => t(`filters.modes.${mode}`)).join(", ")}</Fact>
            <Fact label={t("profile.serviceArea")}>
              {doctor.location ? [doctor.clinicName, doctor.location.locality, doctor.location.city, doctor.location.pin].filter(Boolean).join(", ") : t("card.noLocation")}
            </Fact>
          </dl>
        </section>
        <aside aria-labelledby="profile-book" className="grid content-start gap-4 rounded-lg border border-border bg-surface p-6">
          <h2 id="profile-book" className="text-lg font-semibold text-ink">{t("profile.fee")}</h2>
          <p className="text-2xl font-semibold text-ink tabular">{t("card.fee", { amount: formatPaise(doctor.feePaise, locale) })}</p>
          <p className="text-sm text-muted">{t("profile.feeNote")}</p>
          <h3 className="pt-2 text-base font-semibold text-ink">{t("profile.availability")}</h3>
          <div>{full ? <StatusBadge tone="neutral" label={t("card.fullyBooked")} /> : doctor.openSlots === null ? <StatusBadge tone="neutral" label={t("card.slotsUnknown")} /> : <StatusBadge tone="success" label={t("card.openSlots", { count: doctor.openSlots })} />}</div>
          <p className="text-base text-ink">{doctor.nextSlotAt ? t("card.nextSlot", { time: formatDateTime(doctor.nextSlotAt, locale) }) : t("card.noNextSlot")}</p>
          <p className="text-sm text-muted">{t("profile.availabilityNote")}</p>
          {href && !full ? <Button asChild size="lg"><Link href={href}>{t("card.book")}</Link></Button> : (
            <>
              <Button type="button" size="lg" disabled aria-describedby="profile-book-reason">{t("card.book")}</Button>
              <p id="profile-book-reason" className="text-sm text-muted">{full ? t("card.bookDisabledFull") : t("card.bookDisabledLocation")}</p>
            </>
          )}
          <p className="text-sm text-muted">{t("card.manualAcceptance")}</p>
        </aside>
      </div>
    </Container>
  );
}
