import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Container } from "@/components/public/layout";
import { EmptyState } from "@/components/shared/empty-state";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { GateNotice } from "@/components/shared/gate-notice";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ApiError } from "@/lib/api/result";
import { createDoctorSearchApi, type DoctorSearchApi } from "@/modules/providers/doctor-api";
import { readDoctorSearch, type DoctorPage, type DoctorSearch } from "@/modules/providers/doctor-search";
import { BookingIntl } from "./booking-intl";
import { DoctorResults } from "./doctor-results";
import { DoctorSearchBar } from "./doctor-search-bar";

export type SearchParamsRecord = Record<string, string | string[] | undefined>;
export function toSearchParams(record: SearchParamsRecord): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  return params;
}

export type DoctorSearchLoad = { kind: "invalid" } | { kind: "error"; error: ApiError } | { kind: "ready"; search: DoctorSearch; page: DoctorPage };
/** Server-only: the adapter is resolved per request on the server (fixtures never reach the browser). */
export async function loadDoctorSearch(params: URLSearchParams, api: Pick<DoctorSearchApi, "search"> = createDoctorSearchApi()): Promise<DoctorSearchLoad> {
  const search = readDoctorSearch(params);
  if (!search.ok) return { kind: "invalid" };
  let result;
  try { result = await api.search(search.data); } catch { return { kind: "error", error: { code: "unavailable" } }; }
  return result.ok ? { kind: "ready", search: search.data, page: result.data } : { kind: "error", error: result.error };
}

export async function DoctorSearchResults({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const params = toSearchParams(await searchParams);
  // Results depend on the request time (availability windows) and must never be prerendered.
  await connection();
  const load = await loadDoctorSearch(params);
  const t = await getTranslations("booking");
  const search = load.kind === "ready" ? load.search : undefined;
  return (
    <BookingIntl>
      <Container className="grid gap-8 pb-20">
        <DoctorSearchBar key={params.toString()} defaultQuery={search?.q ?? ""} defaultCity={search?.city ?? ""} />
        {load.kind === "ready" && load.page.synthetic ? <FixtureNotice /> : null}
        {load.kind === "invalid" ? (
          <EmptyState icon="search" title={t("results.invalidTitle")} description={t("results.invalidBody")}
            action={<Button asChild variant="secondary"><Link href="/doctors">{t("results.newSearch")}</Link></Button>} />
        ) : load.kind === "error" ? (
          load.error.code === "gated" ? (
            <GateNotice reason="contract_pending" title={t("results.gatedTitle")}>{t("results.gatedBody")}</GateNotice>
          ) : (
            <Notice tone="danger" title={t("results.errorTitle")}
              action={<Button asChild variant="secondary"><Link href={`/doctors?${params}`}>{t("results.retry")}</Link></Button>}>{t("results.errorBody")}</Notice>
          )
        ) : (
          <DoctorResults search={load.search} page={load.page} />
        )}
      </Container>
    </BookingIntl>
  );
}

export async function DoctorSearchIntro() {
  const t = await getTranslations("booking.search");
  return (
    <Container className="grid gap-4 pt-10 pb-8 md:pt-16">
      <p className="text-sm font-semibold tracking-wide text-forest uppercase">{t("eyebrow")}</p>
      <h1 className="font-display text-[clamp(2.25rem,1.6rem+2.6vw,3.5rem)] leading-[1.08] font-medium tracking-[-0.025em] text-ink">{t("title")}</h1>
      <p className="measure text-lg leading-relaxed text-muted">{t("lead")}</p>
    </Container>
  );
}
