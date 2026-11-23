import { ArrowLeft, Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Container } from "@/components/public/layout";
import { EmergencyBanner } from "@/components/service-requests/emergency-banner";
import { ProviderDirectory } from "@/components/service-requests/provider-directory";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { formatPaise, type Locale } from "@/lib/format";
import { createAmbulanceDirectoryApi } from "@/modules/ambulance-requests/directory";
import { VEHICLE_FITS, type AmbulanceProvider } from "@/modules/ambulance-requests/types";
import { pinSchema } from "@/modules/catalog/schemas";
import { createCareDirectoryApi } from "@/modules/care-requests/directory";
import type { CareProvider } from "@/modules/care-requests/types";
import type { BaseProvider } from "@/modules/service-requests/core";

/**
 * Public, no-sign-in directories for scheduled ambulance transfers (/ambulances) and caretakers (/caretakers).
 * Same shape as /lab-tests: a plain GET PIN filter (so it works without JavaScript and the URL holds only a
 * public area code), a public page per provider, and a request button that goes to the signed-in request form
 * (the patient signs in there). Only the provider's own listing is shown: name, service area, catalogue and
 * price. Ambulance pages keep the 108 notice first; caretaker pages state the non-clinical scope.
 */

type SearchParamsRecord = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || null;
const unavailable = { ok: false as const, error: { code: "unavailable" as const } };

function readPin(record: SearchParamsRecord): { pin: string | null; invalid: boolean } {
  const raw = first(record.pin);
  const parsed = raw ? pinSchema.safeParse(raw) : null;
  return { pin: parsed?.success ? parsed.data : null, invalid: parsed !== null && !parsed.success };
}

function Intro({ title, description, emergency }: { title: string; description: string; emergency?: boolean }) {
  return (
    <Container className="grid gap-4 pt-10 pb-8 md:pt-16">
      {emergency ? <EmergencyBanner /> : null}
      <h1 className="font-display text-[clamp(2.25rem,1.6rem+2.6vw,3.5rem)] leading-[1.08] font-medium tracking-[-0.025em] text-ink">{title}</h1>
      <p className="measure text-lg leading-relaxed text-muted">{description}</p>
    </Container>
  );
}

/** Not found, not connected, or failed: one calm state, with the way back to the list. */
async function DetailProblem({ code, base, id, top, copy }: {
  code: string; base: string; id: string; top?: ReactNode;
  copy: { title: string; back: string; notFoundTitle: string; notFoundBody: string };
}) {
  const ts = await getTranslations("services");
  const back = <Button asChild variant="quiet"><Link href={base}><ArrowLeft aria-hidden />{copy.back}</Link></Button>;
  return (
    <Container className="grid gap-6 py-10">
      {top}
      <div>{back}</div>
      {code === "not_found" ? (
        <>
          <h1 className="font-display text-3xl font-medium text-ink">{copy.notFoundTitle}</h1>
          <p className="text-lg text-muted">{copy.notFoundBody}</p>
          <div><Button asChild variant="secondary"><Link href={base}>{copy.back}</Link></Button></div>
        </>
      ) : code === "gated" ? (
        <>
          <h1 className="font-display text-3xl font-medium text-ink">{copy.title}</h1>
          <GateNotice reason="contract_pending" title={ts("common.notConnectedTitle")} action={<Button asChild variant="secondary"><Link href={base}>{copy.back}</Link></Button>}>{ts("common.notConnectedBody")}</GateNotice>
        </>
      ) : (
        <>
          <h1 className="font-display text-3xl font-medium text-ink">{copy.title}</h1>
          <InlineError code={code as "unavailable"} action={<Button asChild variant="secondary"><Link href={`${base}/${encodeURIComponent(id)}`}>{ts("common.form.retry")}</Link></Button>} />
        </>
      )}
    </Container>
  );
}

async function ProviderHeader({ provider, badge }: { provider: BaseProvider; badge?: string }) {
  const ts = await getTranslations("services");
  return (
    <header className="grid gap-3">
      <h1 className="font-display text-[clamp(2rem,1.5rem+2vw,3rem)] leading-[1.1] font-medium text-ink">{provider.name}</h1>
      {badge ? <p><span className="inline-flex items-center rounded-full border border-border bg-paper px-3 py-1 text-sm font-medium text-ink">{badge}</span></p> : null}
      <p className="text-base text-muted">{provider.area.locality}, {provider.area.city}</p>
      <p className="text-sm text-muted tabular">{ts("common.serves", { pins: provider.area.pins.join(", ") })}</p>
    </header>
  );
}

/* ----------------------------------------------------------------- ambulances */

export async function AmbulanceDirectoryIntro() {
  const t = await getTranslations("services.ambulanceDirectory");
  return <Intro emergency title={t("title")} description={t("description")} />;
}

export async function AmbulanceDirectoryResults({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const { pin, invalid } = readPin(await searchParams);
  await connection();
  const t = await getTranslations("services.ambulance");
  const td = await getTranslations("services.ambulanceDirectory");
  const api = await createAmbulanceDirectoryApi();
  const result = await api.list(pin ? { pin } : {}).catch(() => unavailable);
  return (
    <Container className="grid gap-8 pb-20">
      {result.ok && result.data.synthetic ? <FixtureNotice /> : null}
      <ProviderDirectory<AmbulanceProvider> segment="/ambulances" result={result} pin={pin} pinInvalid={invalid}
        requestLabel={t("request")} detail={{ viewLabel: td("view") }}
        fromPaise={provider => Math.min(...provider.vehicles.map(vehicle => vehicle.farePaise))}
        meta={provider => <p className="text-sm text-ink">{t("vehicles")}: {provider.vehicles.map(vehicle => t(`vehicleType.${vehicle.type}`)).join(", ")}</p>} />
    </Container>
  );
}

export async function AmbulanceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const t = await getTranslations("services.ambulance");
  const td = await getTranslations("services.ambulanceDirectory");
  const ts = await getTranslations("services");
  const locale = (await getLocale()) as Locale;
  const api = await createAmbulanceDirectoryApi();
  const result: ApiResult<{ provider: AmbulanceProvider; synthetic: boolean }> = await api.get(id).catch(() => unavailable);
  if (!result.ok) {
    return <DetailProblem code={result.error.code} base="/ambulances" id={id} top={<EmergencyBanner />}
      copy={{ title: td("title"), back: td("back"), notFoundTitle: td("notFoundTitle"), notFoundBody: td("notFoundBody") }} />;
  }
  const operator = result.data.provider;
  return (
    <Container className="grid gap-8 py-10 pb-20">
      <EmergencyBanner />
      {result.data.synthetic ? <FixtureNotice /> : null}
      <div><Button asChild variant="quiet"><Link href="/ambulances"><ArrowLeft aria-hidden />{td("back")}</Link></Button></div>
      <ProviderHeader provider={operator} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="ambulance-vehicles-title" className="grid content-start gap-4">
          <h2 id="ambulance-vehicles-title" className="text-xl font-semibold text-ink">{td("vehiclesTitle")}</h2>
          <p className="text-base text-muted">{t("vehicleHint")}</p>
          <ul className="grid gap-3">
            {operator.vehicles.map(vehicle => (
              <li key={vehicle.type} data-testid="ambulance-vehicle" className="grid gap-1 rounded-lg border border-border bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-lg font-semibold text-ink">{t(`vehicleType.${vehicle.type}`)}</h3>
                  <p className="text-lg font-semibold text-ink tabular">{t("fare", { price: formatPaise(vehicle.farePaise, locale) })}</p>
                </div>
                {VEHICLE_FITS.stretcher.includes(vehicle.type) ? null : <p className="text-sm text-muted">{t("vehicleUnfit")}</p>}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="ambulance-request-title" className="grid content-start gap-4 rounded-lg border border-border bg-surface p-5">
          <h2 id="ambulance-request-title" className="text-lg font-semibold text-ink">{t("request")}</h2>
          <p className="text-base text-ink">{t("description")}</p>
          <p className="text-sm text-muted">{t("noTracking")}</p>
          <p className="text-sm text-muted">{ts("common.manual")}</p>
          <div><Button asChild><Link href={`/patient/ambulance/request?providerId=${operator.id}`} aria-label={t("requestTitle", { name: operator.name })}>{t("request")}</Link></Button></div>
          <p className="text-sm text-muted">{td("requestNote")}</p>
        </section>
      </div>
    </Container>
  );
}

/* ----------------------------------------------------------------- caretakers */

export async function CareDirectoryIntro() {
  const t = await getTranslations("services.careDirectory");
  return <Intro title={t("title")} description={t("description")} />;
}

export async function CareDirectoryResults({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const { pin, invalid } = readPin(await searchParams);
  await connection();
  const t = await getTranslations("services.care");
  const td = await getTranslations("services.careDirectory");
  const api = await createCareDirectoryApi();
  const result = await api.list(pin ? { pin } : {}).catch(() => unavailable);
  return (
    <Container className="grid gap-8 pb-20">
      {result.ok && result.data.synthetic ? <FixtureNotice /> : null}
      <ProviderDirectory<CareProvider> segment="/caretakers" result={result} pin={pin} pinInvalid={invalid}
        requestLabel={t("request")} detail={{ viewLabel: td("view") }}
        fromPaise={provider => provider.hourlyRatePaise * provider.minHours}
        meta={provider => (
          <div className="grid gap-1 text-sm text-ink">
            <p className="font-medium">{t(`kind.${provider.kind}`)}</p>
            <p>{t("languages", { languages: provider.languages.map(code => t(`lang.${code}`)).join(", ") })}</p>
            <p>{provider.tasks.map(task => t(`task.${task}`)).join(", ")}</p>
            <p className="tabular">{t("hoursRange", { min: provider.minHours, max: provider.maxHours })}</p>
          </div>
        )} />
    </Container>
  );
}

export async function CareDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const t = await getTranslations("services.care");
  const td = await getTranslations("services.careDirectory");
  const ts = await getTranslations("services");
  const locale = (await getLocale()) as Locale;
  const api = await createCareDirectoryApi();
  const result: ApiResult<{ provider: CareProvider; synthetic: boolean }> = await api.get(id).catch(() => unavailable);
  if (!result.ok) {
    return <DetailProblem code={result.error.code} base="/caretakers" id={id}
      copy={{ title: td("title"), back: td("back"), notFoundTitle: td("notFoundTitle"), notFoundBody: td("notFoundBody") }} />;
  }
  const caretaker = result.data.provider;
  return (
    <Container className="grid gap-8 py-10 pb-20">
      {result.data.synthetic ? <FixtureNotice /> : null}
      <div><Button asChild variant="quiet"><Link href="/caretakers"><ArrowLeft aria-hidden />{td("back")}</Link></Button></div>
      <ProviderHeader provider={caretaker} badge={t(`kind.${caretaker.kind}`)} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-8">
          <section aria-labelledby="care-tasks-title" className="grid gap-4">
            <h2 id="care-tasks-title" className="text-xl font-semibold text-ink">{td("tasksTitle")}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {caretaker.tasks.map(task => (
                <li key={task} data-testid="care-task" className="flex items-start gap-2 rounded-lg border border-border bg-surface p-4 text-base text-ink">
                  <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-forest" />{t(`task.${task}`)}
                </li>
              ))}
            </ul>
          </section>
          <Notice tone="neutral" title={t("scopeTitle")}>{t("scopeBody")}</Notice>
        </div>

        <section aria-labelledby="care-details-title" className="grid content-start gap-4 rounded-lg border border-border bg-surface p-5">
          <h2 id="care-details-title" className="text-lg font-semibold text-ink">{td("detailsTitle")}</h2>
          <p className="text-lg font-semibold text-ink tabular">{t("rate", { price: formatPaise(caretaker.hourlyRatePaise, locale) })}</p>
          <p className="text-base text-ink tabular">{t("hoursRange", { min: caretaker.minHours, max: caretaker.maxHours })}</p>
          <p className="text-base text-ink">{t("languages", { languages: caretaker.languages.map(code => t(`lang.${code}`)).join(", ") })}</p>
          <p className="text-sm text-muted">{t("recurring")}</p>
          <p className="text-sm text-muted">{ts("common.manual")}</p>
          <div><Button asChild><Link href={`/patient/caretakers/request?providerId=${caretaker.id}`} aria-label={t("requestTitle", { name: caretaker.name })}>{t("request")}</Link></Button></div>
          <p className="text-sm text-muted">{td("requestNote")}</p>
        </section>
      </div>
    </Container>
  );
}
