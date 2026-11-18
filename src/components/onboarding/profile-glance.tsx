import { CircleCheck, CircleAlert, Pencil } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Notice } from "@/components/shared/notice";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AnswerSummary, PatientProfileView, ProfileCompleteness } from "@/modules/onboarding/profile";
import { formatIndianMobile } from "@/components/shared/input-format";
import { fieldDomId } from "./form-spec";
import { formatCoordinates } from "./coordinates";

const EDIT_HREF = "/patient/health-profile";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[12rem_1fr] sm:gap-6">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="text-base text-ink">{children}</dd>
    </div>
  );
}

/** Readiness banner: green "Ready to book" or "n of 13" with jump links to the missing fields. */
export async function ReadinessBanner({ completeness }: { completeness: ProfileCompleteness }) {
  const t = await getTranslations("onboarding.profile");
  if (completeness.readyToBook) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-md border border-success/30 bg-success-surface p-4" data-testid="profile-completion">
        <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
        <p className="text-base font-semibold text-ink">{t("ready", { done: completeness.completed, total: completeness.total })}</p>
      </div>
    );
  }
  return (
    <div role="status" className="grid gap-3 rounded-md border border-warning/40 bg-warning-surface p-4" data-testid="profile-completion">
      <p className="flex items-start gap-3 text-base font-semibold text-ink">
        <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning-text" />
        {t("notReady", { done: completeness.completed, total: completeness.total })}
      </p>
      <ul className="grid gap-1 pl-8 sm:grid-cols-2">
        {completeness.items
          .filter((i) => !i.complete)
          .map((i) => (
            <li key={i.id}>
              <Link href={`${EDIT_HREF}#${fieldDomId(i.field)}`} className="inline-flex min-h-target items-center text-forest underline underline-offset-4">
                {t(`items.${i.id}`)}
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}

async function answerText(a: AnswerSummary, kind: "allergies" | "medicalHistory" | "medicines" | "surgeries") {
  const t = await getTranslations("onboarding.profile");
  if (a.state === "missing") return <span className="text-muted">{t("notAnswered")}</span>;
  if (a.state === "none") return t(`none.${kind}`);
  if (a.state === "unknown") return t("unknown");
  return (
    <ul className="grid gap-1">
      {a.items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** "Your profile at a glance": identity details and the separate, unverified health record. */
export async function ProfileGlance({ view }: { view: PatientProfileView }) {
  const [t, format] = await Promise.all([getTranslations("onboarding"), getFormatter()]);
  const id = view.identity;
  const h = view.health;
  const missing = <span className="text-muted">{t("profile.notAnswered")}</span>;

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
      <section aria-labelledby="glance-identity" className="grid content-start gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="glance-identity" className="font-display text-2xl font-medium text-ink">
            {t("profile.identityTitle")}
          </h2>
          <Button asChild variant="quiet">
            <Link href={EDIT_HREF}>
              <Pencil aria-hidden />
              {t("profile.edit")}
            </Link>
          </Button>
        </div>
        <dl>
          <Row label={t("profile.items.fullName")}>{id.fullName ?? missing}</Row>
          <Row label={t("fields.patient.email")}>{id.email ?? <span className="text-muted">{t("profile.optionalNotGiven")}</span>}</Row>
          <Row label={t("profile.items.mobile")}>
            {id.mobile ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="tabular">+91 {formatIndianMobile(id.mobile.replace(/^\+91/, ""))}</span>
                <StatusBadge tone={id.mobileVerified ? "success" : "neutral"} label={id.mobileVerified ? t("profile.mobileVerified") : t("profile.mobileNotVerified")} />
              </span>
            ) : (
              missing
            )}
          </Row>
          <Row label={t("profile.items.dateOfBirth")}>
            {id.dateOfBirth ? (
              <>
                {format.dateTime(new Date(`${id.dateOfBirth}T00:00:00Z`), { dateStyle: "long", timeZone: "UTC" })}
                {id.ageYears !== null ? <span className="ml-2 text-muted">{t("profile.age", { years: id.ageYears })}</span> : null}
              </>
            ) : (
              missing
            )}
          </Row>
          <Row label={t("profile.items.gender")}>{id.gender ? t(`options.gender.${id.gender as "female"}`) : missing}</Row>
          <Row label={t("profile.items.address")}>
            {id.address ? (
              <address className="not-italic">
                {id.address.line1}
                {id.address.line2 ? `, ${id.address.line2}` : ""}
                {id.address.landmark ? <span className="block text-muted">{t("profile.landmark", { landmark: id.address.landmark })}</span> : null}
                <span className="block">
                  {id.address.city}, {id.address.state} <span className="tabular">{id.address.pinCode}</span>
                </span>
              </address>
            ) : (
              missing
            )}
          </Row>
          <Row label={t("profile.items.location")}>
            {id.location ? <span className="tabular">{formatCoordinates(id.location.lat, id.location.lng, id.location.accuracyM)}</span> : missing}
          </Row>
          <Row label={t("fields.common.photo")}>
            <span className="text-muted">{t("fields.common.photoUnavailable")}</span>
          </Row>
        </dl>
      </section>

      <section aria-labelledby="glance-health" className="grid content-start gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="glance-health" className="font-display text-2xl font-medium text-ink">
            {t("profile.healthTitle")}
          </h2>
          <StatusBadge tone="warning" icon="alert" label={t("profile.unverifiedBadge")} />
        </div>
        <Notice tone="warning">{t("profile.unverifiedBody")}</Notice>
        <dl>
          <Row label={t("profile.items.bloodGroup")}>
            {h.bloodGroup.state === "known" ? h.bloodGroup.value : h.bloodGroup.state === "unknown" ? t("profile.unknown") : missing}
          </Row>
          <Row label={t("profile.items.height")}>{h.heightCm !== null ? t("profile.heightValue", { cm: h.heightCm }) : missing}</Row>
          <Row label={t("profile.items.weight")}>{h.weightKg !== null ? t("profile.weightValue", { kg: format.number(h.weightKg, { maximumFractionDigits: 1 }) }) : missing}</Row>
          <Row label={t("profile.items.allergies")}>{await answerText(h.allergies, "allergies")}</Row>
          <Row label={t("profile.items.medicalHistory")}>{await answerText(h.medicalHistory, "medicalHistory")}</Row>
          <Row label={t("profile.items.medicines")}>{await answerText(h.medicines, "medicines")}</Row>
          <Row label={t("profile.items.surgeries")}>{await answerText(h.surgeries, "surgeries")}</Row>
        </dl>
      </section>
    </div>
  );
}
