import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import { patientLoginRedirect, requirePatientSession } from "@/modules/patient-dashboard/session";
import { AccessDenied } from "@/components/auth/access-denied";
import { canChangeReview, getReviewsApi } from "@/modules/reviews";
import { editReviewAction } from "../../actions";
import { ReviewForm } from "../../_components/review-form";

export async function generateMetadata() {
  const t = await getTranslations("patientAccount.reviews.form");
  return { title: t("editTitle"), robots: { index: false } };
}

const toLocale = (l: string) => (l === "te" || l === "hi" ? l : "en");

/** Edit an existing review. The change goes back to moderation; withdrawn, missing and other-account reviews get a notice. */
export default async function EditReviewPage({ params }: PageProps<"/[locale]/patient/reviews/[bookingId]/edit">) {
  const { locale: raw, bookingId } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = await requirePatientSession(locale, `/${locale}/patient/reviews`);
  if (session.status !== "ok") return <AccessDenied reason={session.reason} />;
  const t = await getTranslations("patientAccount.reviews");
  const result = await getReviewsApi(process.env, session.fixtureActor).getVisit(bookingId).catch(() => fail("unavailable"));
  if (!result.ok && result.error.code === "unauthenticated") redirect(patientLoginRedirect(locale, `/${locale}/patient/reviews`));
  const visit = result.ok ? result.data : null;

  const header = (
    <PageHeader
      title={t("form.editTitle")}
      description={visit ? t("visit", { provider: visit.providerDisplayName, reference: visit.bookingReference }) : undefined}
      breadcrumb={<Breadcrumb items={[{ label: t("title"), href: "/patient/reviews" }, { label: t("form.editTitle") }]} />}
    />
  );
  const back = (
    <div>
      <Button asChild variant="quiet">
        <Link href="/patient/reviews">
          <ArrowLeft aria-hidden />
          {t("form.back")}
        </Link>
      </Button>
    </div>
  );
  const notice = (text: string) => (
    <PatientShell synthetic={session.synthetic}>
      {header}
      <Notice tone="neutral" icon="lock">
        {text}
      </Notice>
      {back}
    </PatientShell>
  );

  if (!result.ok) {
    const code = result.error.code;
    if (code === "not_found" || code === "forbidden" || code === "validation") return notice(t("state.notFound"));
    return (
      <PatientShell synthetic={session.synthetic}>
        {header}
        {code === "gated" ? <GateNotice reason="contract_pending">{t("state.gated")}</GateNotice> : <InlineError code={code} action={<RetryAction />} />}
        {back}
      </PatientShell>
    );
  }
  const review = result.data.review;
  if (!review) return notice(t("state.notFound"));
  if (!canChangeReview(review)) return notice(t("state.cannotEdit"));

  return (
    <PatientShell synthetic={session.synthetic}>
      {header}
      <Notice tone="info">{t("editNote")}</Notice>
      <p className="measure text-muted">{t("form.intro")}</p>
      <IntlScope namespaces={["patientAccount"]}>
        <ReviewForm mode="edit" bookingId={result.data.bookingId} review={review} edit={editReviewAction} />
      </IntlScope>
    </PatientShell>
  );
}
