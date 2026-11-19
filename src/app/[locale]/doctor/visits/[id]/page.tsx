import { Phone, Siren } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CollectionForm } from "@/components/clinical/collection-form";
import { badgeFor } from "@/components/clinical/kit";
import { ProofCard } from "@/components/clinical/proof-card";
import { getClinicalFormat } from "@/components/clinical/server-format";
import { guardDoctorPage } from "@/components/doctor/guard";
import { FreshnessStatus } from "@/components/doctor/freshness-status";
import { PageStateView } from "@/components/doctor/page-state-view";
import { VisitNextStep } from "@/components/doctor/visit-actions";
import { VisitProgress } from "@/components/doctor/visit-progress";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import { getDoctorApi } from "@/modules/doctor";
import { loadVisitDetail } from "@/modules/doctor/loaders";
import { describeBookingState, describeVisitPhase } from "@/modules/doctor/status";
import { getRecordsApi } from "@/modules/records";
import {
  advanceVisitAction,
  issueProofAction,
  recordCollectionAction,
  resendArrivalCodeAction,
  revokeProofAction,
  verifyArrivalAction,
} from "../../actions";

export async function generateMetadata() {
  const t = await getTranslations("doctor.visit");
  // Never put the patient's name in the document title (CONVENTIONS: no PHI in titles).
  return { title: t("titleFallback"), robots: { index: false } };
}

const ATTENDED = new Set(["arrival_verified", "service_started", "service_completed"]);

export default async function DoctorVisitPage({ params }: PageProps<"/[locale]/doctor/visits/[id]">) {
  const { locale, id } = await params;
  const g = await guardDoctorPage(locale, `/visits/${id}`);
  if (!g.ok) return g.view;
  const [t, tc, nav, f] = await Promise.all([getTranslations("doctor.visit"), getTranslations("doctor.common"), getTranslations("doctor.shell.nav"), getClinicalFormat()]);
  const fetchedAt = new Date();
  const state = await loadVisitDetail(getDoctorApi(process.env, g.session.ctx), id, fetchedAt);
  const crumbs = (label: string) => <Breadcrumb items={[{ label: nav("visits"), href: "/doctor/visits" }, { label }]} />;

  if (state.kind !== "ready") {
    return (
      <div className="grid gap-8">
        <PageHeader title={t("titleFallback")} breadcrumb={crumbs(t("titleFallback"))} />
        <PageStateView state={state} />
      </div>
    );
  }

  const { visit: v, actions, challenge } = state.data;
  const collection = await getRecordsApi(process.env, g.session.ctx).getCollection(v.bookingId);
  const clinicalOn = isClinicalEnabled();
  const allergyText = v.hasKnownAllergies === true ? t("allergiesYes") : v.hasKnownAllergies === false ? t("allergiesNo") : t("allergiesUnknown");

  return (
    <div className="grid gap-8">
      <PageHeader
        title={v.patient.displayName}
        breadcrumb={crumbs(v.publicReference)}
        description={`${v.serviceName} · ${t("scheduled", { time: f.dateTime(v.scheduledStartAt) })}`}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <span className="sr-only">{tc("bookingStatus")}:</span>
            <StatusBadge {...badgeFor(describeBookingState(v.state), f.tk)} />
            <span className="sr-only">{tc("visitStatus")}:</span>
            <StatusBadge {...badgeFor(describeVisitPhase(v.phase), f.tk)} />
            {/* Payment is its own state, never derived from booking/visit/collection (DC10). */}
            <StatusBadge tone={v.paymentState === "PAID" ? "success" : "neutral"} icon={v.paymentState === "PAID" ? undefined : "clock"} label={`${tc("paymentStatus")}: ${tc(`paymentState.${v.paymentState}`)}`} />
            <span className="text-muted tabular">{t("reference", { reference: v.publicReference })}</span>
          </span>
        }
      />

      <section aria-labelledby="visit-progress" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="visit-progress" className="text-lg font-semibold text-ink">
            {t("progress")}
          </h2>
          <FreshnessStatus time={f.time(fetchedAt.toISOString())} />
        </div>
        <VisitProgress phase={v.phase} />
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-10">
          <section aria-labelledby="next-step" className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
            <h2 id="next-step" className="text-lg font-semibold text-ink">
              {t("nextStep")}
            </h2>
            <VisitNextStep
              bookingId={v.bookingId}
              version={v.version}
              allowed={actions}
              consultationId={v.consultationId}
              challenge={challenge?.kind === "ready" ? challenge.data.challenge : null}
              challengeError={challenge !== null && challenge.kind !== "ready"}
              actions={{ advance: advanceVisitAction, verify: verifyArrivalAction, resend: resendArrivalCodeAction }}
            />
          </section>

          {collection.ok ? (
            <CollectionForm bookingId={v.bookingId} view={collection.data} canRecord={v.state === "in_progress" || v.state === "completed"} record={recordCollectionAction} />
          ) : (
            <PageStateView state={{ kind: "error", code: collection.error.code, retryable: collection.error.code === "unavailable" }} />
          )}

          {clinicalOn ? <ProofCard bookingId={v.bookingId} available={ATTENDED.has(v.phase)} issue={issueProofAction} revoke={revokeProofAction} /> : null}
        </div>

        <aside className="grid content-start gap-6">
          <dl className="grid gap-4">
            <div className="grid gap-1">
              <dt className="text-sm text-muted">{t("patient")}</dt>
              <dd className="text-ink">
                {v.patient.displayName} · {v.patient.ageYears === null ? tc("ageUnknown") : tc("age", { age: v.patient.ageYears })}
              </dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm text-muted">{t("contact")}</dt>
              <dd className="text-ink">
                {v.contactPhone ? (
                  <a href={`tel:${v.contactPhone}`} className="inline-flex min-h-target items-center gap-2 text-forest underline underline-offset-4 tabular">
                    <Phone aria-hidden className="size-4" />
                    {v.contactPhone}
                  </a>
                ) : (
                  t("noContact")
                )}
              </dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm text-muted">{t("address")}</dt>
              <dd className="text-ink">
                {v.address.line1}, {v.address.locality} {v.address.pin}
              </dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm text-muted">{t("allergies")}</dt>
              <dd className="text-ink">{allergyText}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm text-muted">{tc("paymentStatus")}</dt>
              <dd className="text-ink">
                {tc(`paymentState.${v.paymentState}`)} · {f.money(v.amountPaise)}
              </dd>
            </div>
          </dl>
          <p className="flex gap-3 rounded-md bg-paper-deep p-4 text-sm text-ink">
            <Siren aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
            {tc("emergency")}
          </p>
        </aside>
      </div>
    </div>
  );
}
