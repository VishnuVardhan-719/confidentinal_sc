import { ArrowLeft, FlaskConical, Home, MapPin } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Container } from "@/components/public/layout";
import { InlineError } from "@/components/shared/inline-error";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { formatPaise, type Locale } from "@/lib/format";
import { createLabDirectoryApi, labDirectoryFilterSchema, matchingTests, type LabDirectoryFilter, type LabListing } from "@/modules/lab-orders/directory";

type SearchParamsRecord = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
const unavailable = { ok: false as const, error: { code: "unavailable" as const } };

/** Reads only the two public filters from the URL; anything else is ignored. */
export function readLabFilter(record: SearchParamsRecord): { filter: LabDirectoryFilter; testInvalid: boolean; raw: { test?: string; city?: string } } {
  const raw = { test: first(record.test), city: first(record.city) };
  const test = raw.test ? labDirectoryFilterSchema.shape.test.safeParse(raw.test) : null;
  const city = raw.city ? labDirectoryFilterSchema.shape.city.safeParse(raw.city) : null;
  return { filter: { ...(test?.success ? { test: test.data } : {}), ...(city?.success ? { city: city.data } : {}) }, testInvalid: test !== null && !test.success, raw };
}

export async function LabDirectoryIntro() {
  const t = await getTranslations("services.labDirectory");
  return (
    <Container className="grid gap-4 pt-10 pb-8 md:pt-16">
      <h1 className="font-display text-[clamp(2.25rem,1.6rem+2.6vw,3.5rem)] leading-[1.08] font-medium tracking-[-0.025em] text-ink">{t("title")}</h1>
      <p className="measure text-lg leading-relaxed text-muted">{t("description")}</p>
    </Container>
  );
}

function CollectionBadges({ lab, label }: { lab: Pick<LabListing, "collectionOptions">; label: (key: "home" | "walk_in") => string }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {lab.collectionOptions.map(option => (
        <li key={option} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3 py-1 text-sm text-ink">
          {option === "home" ? <Home aria-hidden className="size-4 text-forest" /> : <MapPin aria-hidden className="size-4 text-forest" />}{label(option)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Public lab list with a plain GET filter (test name and city), so it works without JavaScript and the URL
 * holds only those two public filters. Prices are each lab's own, in integer paise.
 */
export async function LabDirectoryResults({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const { filter, testInvalid, raw } = readLabFilter(await searchParams);
  await connection();
  const t = await getTranslations("services.labDirectory");
  const ts = await getTranslations("services");
  const locale = (await getLocale()) as Locale;
  const api = await createLabDirectoryApi();
  const result = await api.list(filter).catch(() => unavailable);
  const cities = result.ok ? result.data.cities : [];
  const query = new URLSearchParams(Object.entries(filter).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();
  return (
    <Container className="grid gap-8 pb-20">
      <form method="get" role="search" aria-label={t("filterLabel")} className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end sm:p-6">
        <div className="grid gap-1">
          <label htmlFor="lab-test" className="text-base font-semibold text-ink">{t("testLabel")}</label>
          <p id="lab-test-hint" className="text-sm text-muted">{t("testHint")}</p>
          {testInvalid ? <p id="lab-test-error" className="text-sm font-medium text-danger">{t("testError")}</p> : null}
          <Input id="lab-test" name="test" defaultValue={raw.test ?? ""} maxLength={60} autoComplete="off"
            aria-describedby={testInvalid ? "lab-test-error lab-test-hint" : "lab-test-hint"} aria-invalid={testInvalid || undefined} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="lab-city" className="text-base font-semibold text-ink">{t("cityLabel")}</label>
          <select id="lab-city" name="city" defaultValue={filter.city ?? ""}
            className="min-h-target w-full rounded-md border border-border-strong bg-surface px-3 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <option value="">{t("allCities")}</option>
            {cities.map(city => <option key={city} value={city}>{city}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit">{t("search")}</Button>
          {query || testInvalid ? <Button asChild variant="quiet"><Link href="/lab-tests">{t("clear")}</Link></Button> : null}
        </div>
      </form>

      {result.ok && result.data.synthetic ? <FixtureNotice /> : null}
      {!result.ok ? (
        result.error.code === "gated"
          ? <Notice tone="neutral" icon="lock" title={ts("common.notConnectedTitle")} action={<Button asChild variant="secondary"><Link href="/doctors">{ts("errorPage.back.book")}</Link></Button>}>{ts("common.notConnectedBody")}</Notice>
          : <InlineError code={result.error.code} action={<Button asChild variant="secondary"><Link href={query ? `/lab-tests?${query}` : "/lab-tests"}>{ts("common.form.retry")}</Link></Button>} />
      ) : (
        <section aria-labelledby="lab-results" className="grid gap-4">
          <h2 id="lab-results" className="text-lg font-semibold text-ink" aria-live="polite">{t("results", { count: result.data.items.length })}</h2>
          {result.data.items.length === 0 ? (
            <Notice tone="neutral" title={t("emptyTitle")} action={<Button asChild variant="secondary"><Link href="/lab-tests">{t("clear")}</Link></Button>}>{t("emptyBody")}</Notice>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {result.data.items.map(lab => {
                const tests = matchingTests(lab, filter.test);
                return (
                  <li key={lab.id} data-testid="lab-card" className="grid content-between gap-4 rounded-lg border border-border bg-surface p-5">
                    <div className="grid gap-3">
                      <h3 className="font-display text-xl font-medium text-ink">
                        <Link href={`/lab-tests/${lab.id}`} className="rounded-sm hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus">{lab.name}</Link>
                      </h3>
                      <p className="text-sm text-muted">{lab.area.locality}, {lab.area.city}</p>
                      <CollectionBadges lab={lab} label={key => t(`collection.${key}`)} />
                      <div className="grid gap-1">
                        <p className="text-sm font-medium text-muted">{filter.test ? t("matching") : ts("lab.testsCount", { count: lab.tests.length })}</p>
                        <ul className="grid gap-1">
                          {tests.map(test => (
                            <li key={test.id} className="flex flex-wrap items-baseline justify-between gap-x-4 text-base text-ink">
                              <span>{test.name}</span><span className="tabular">{formatPaise(test.pricePaise, locale)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div><Button asChild variant="secondary"><Link href={`/lab-tests/${lab.id}`} aria-label={t("viewLabFor", { name: lab.name })}>{t("viewLab")}</Link></Button></div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-sm text-muted">{ts("common.manual")}</p>
        </section>
      )}
    </Container>
  );
}

/** One lab: collection options, every test with its sample, preparation, report time and price, and how to request. */
export async function LabDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const t = await getTranslations("services.labDirectory");
  const ts = await getTranslations("services");
  const locale = (await getLocale()) as Locale;
  const api = await createLabDirectoryApi();
  const result = await api.get(id).catch(() => unavailable);
  const back = <Button asChild variant="quiet"><Link href="/lab-tests"><ArrowLeft aria-hidden />{t("back")}</Link></Button>;
  if (!result.ok) {
    return (
      <Container className="grid gap-6 py-10">
        <div>{back}</div>
        {result.error.code === "not_found" ? (
          <>
            <h1 className="font-display text-3xl font-medium text-ink">{t("notFoundTitle")}</h1>
            <p className="text-lg text-muted">{t("notFoundBody")}</p>
            <div><Button asChild variant="secondary"><Link href="/lab-tests">{t("back")}</Link></Button></div>
          </>
        ) : result.error.code === "gated" ? (
          <>
            <h1 className="font-display text-3xl font-medium text-ink">{t("title")}</h1>
            <Notice tone="neutral" icon="lock" title={ts("common.notConnectedTitle")}>{ts("common.notConnectedBody")}</Notice>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-medium text-ink">{t("title")}</h1>
            <InlineError code={result.error.code} action={<Button asChild variant="secondary"><Link href={`/lab-tests/${id}`}>{ts("common.form.retry")}</Link></Button>} />
          </>
        )}
      </Container>
    );
  }
  const lab = result.data;
  return (
    <Container className="grid gap-8 py-10 pb-20">
      {lab.synthetic ? <FixtureNotice /> : null}
      <div>{back}</div>
      <header className="grid gap-3">
        <h1 className="font-display text-[clamp(2rem,1.5rem+2vw,3rem)] leading-[1.1] font-medium text-ink">{lab.name}</h1>
        <p className="text-base text-muted">{lab.area.locality}, {lab.area.city}</p>
        <p className="text-sm text-muted tabular">{ts("common.serves", { pins: lab.area.pins.join(", ") })}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="lab-tests-title" className="grid content-start gap-4">
          <h2 id="lab-tests-title" className="text-xl font-semibold text-ink">{t("testsTitle")}</h2>
          <ul className="grid gap-3">
            {lab.tests.map(test => (
              <li key={test.id} data-testid="lab-test" className="grid gap-3 rounded-lg border border-border bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-ink"><FlaskConical aria-hidden className="size-5 text-forest" />{test.name}</h3>
                  <p className="text-lg font-semibold text-ink tabular"><span className="sr-only">{t("price")}: </span>{formatPaise(test.pricePaise, locale)}</p>
                </div>
                <dl className="grid gap-2 text-base sm:grid-cols-3">
                  <div className="grid gap-0.5"><dt className="text-sm text-muted">{t("sample")}</dt><dd className="text-ink">{ts(`lab.specimen.${test.specimen}`)}</dd></div>
                  <div className="grid gap-0.5 sm:col-span-2"><dt className="text-sm text-muted">{t("preparation")}</dt><dd className="text-ink">{ts(`lab.preparation.${test.preparation}`)}</dd></div>
                  <div className="grid gap-0.5"><dt className="text-sm text-muted">{t("report")}</dt><dd className="text-ink tabular">{t("reportHours", { hours: test.reportHours })}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <aside aria-labelledby="lab-collection-title" className="grid content-start gap-4 rounded-lg border border-border bg-surface p-5">
          <h2 id="lab-collection-title" className="text-lg font-semibold text-ink">{t("collectionTitle")}</h2>
          <CollectionBadges lab={lab} label={key => t(`collection.${key}`)} />
          {lab.collectionOptions.includes("home") ? (
            <p className="text-base text-ink tabular">{lab.collectionFeePaise > 0 ? t("collectionFee", { price: formatPaise(lab.collectionFeePaise, locale) }) : t("noCollectionFee")}</p>
          ) : null}
          <p className="text-sm text-muted">{ts("common.manual")}</p>
          <p className="text-sm text-muted">{ts("lab.reportNote")}</p>
          <div><Button asChild><Link href={`/patient/lab-tests/request?providerId=${lab.id}`} aria-label={t("requestFor", { name: lab.name })}>{t("request")}</Link></Button></div>
          <p className="text-sm text-muted">{t("requestNote")}</p>
        </aside>
      </div>
    </Container>
  );
}
