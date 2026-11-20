import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { z } from "zod";
import { BookingWizard } from "@/components/booking/booking-wizard";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { journeyApis } from "@/modules/bookings/journey";
import { requirePatientSession } from "@/modules/patient-dashboard/session";
import { addAddressAction, bookingOfferAction, createBookingAction, getBookingAction, listSlotsAction, prepareBookingAction } from "./actions";
import { AccessDenied } from "@/components/auth/access-denied";
import { PatientBookShell } from "./shell";

export async function generateMetadata() {
  const t = await getTranslations("booking.wizard");
  return { title: t("pageTitle"), robots: { index: false } };
}

const toLocale = (value: string) => (value === "te" || value === "hi" ? value : "en");
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Booking request wizard for one doctor. The doctor, fee and service area are read on the server from the
 * public doctor record; the URL carries only the public provider and service IDs (no patient data).
 */
export default async function PatientBookPage({ params, searchParams }: PageProps<"/[locale]/patient/book">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = await requirePatientSession(locale, `/${locale}/patient/book`);
  const query = await searchParams;
  const providerId = z.uuid().safeParse(first(query.providerId));
  const serviceId = z.uuid().safeParse(first(query.serviceId));
  // Advisory guard for navigation; every server action re-checks the session.
  if (session.status !== "ok") return <AccessDenied reason={session.reason} />;

  const t = await getTranslations("booking.wizard");
  const back = <Button asChild variant="quiet"><Link href="/doctors"><ArrowLeft aria-hidden />{t("backToSearch")}</Link></Button>;
  if (!providerId.success || !serviceId.success) {
    return (
      <PatientBookShell>
        <PageHeader title={t("pageTitle")} />
        <Notice tone="neutral" title={t("missingDoctorTitle")} action={back}>{t("missingDoctorBody")}</Notice>
      </PatientBookShell>
    );
  }

  const apis = journeyApis();
  const [doctor, members, addresses] = await Promise.all([
    apis.doctors.get(providerId.data).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } })),
    apis.patient.listMembers().catch(() => ({ ok: false as const, error: { code: "unavailable" as const } })),
    apis.patient.listAddresses().catch(() => ({ ok: false as const, error: { code: "unavailable" as const } })),
  ]);
  const tb = await getTranslations("booking");
  const usable = doctor.ok && doctor.data.serviceId === serviceId.data && doctor.data.location !== null && doctor.data.openSlots !== 0;

  return (
    <PatientBookShell>
      {session.synthetic ? <FixtureNotice /> : null}
      <div>{back}</div>
      <PageHeader title={doctor.ok ? t("titleFor", { name: doctor.data.displayName }) : t("pageTitle")} description={t("description")} />
      {!doctor.ok ? (
        doctor.error.code === "not_found" || doctor.error.code === "validation"
          ? <Notice tone="neutral" title={t("missingDoctorTitle")} action={back}>{t("missingDoctorBody")}</Notice>
          : <InlineError code={doctor.error.code} action={back} />
      ) : !usable || !doctor.data.location ? (
        <Notice tone="neutral" title={t("notBookableTitle")} action={back}>{t("notBookableBody")}</Notice>
      ) : !members.ok ? (
        <InlineError code={members.error.code} action={back} />
      ) : !addresses.ok ? (
        <InlineError code={addresses.error.code} action={back} />
      ) : (
        <IntlScope namespaces={["booking"]}>
          <BookingWizard
            doctor={{ providerId: doctor.data.providerId, serviceId: doctor.data.serviceId, displayName: doctor.data.displayName,
              specialities: doctor.data.specialities.map(key => tb(`search.specialities.${key}`)).join(", "), feePaise: doctor.data.feePaise,
              area: doctor.data.location, synthetic: doctor.data.synthetic }}
            members={members.data.items}
            addresses={addresses.data.items}
            actions={{ offer: bookingOfferAction, addAddress: addAddressAction, slots: listSlotsAction, prepare: prepareBookingAction, create: createBookingAction, get: getBookingAction }}
          />
        </IntlScope>
      )}
    </PatientBookShell>
  );
}
