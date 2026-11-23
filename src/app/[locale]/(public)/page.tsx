import { ArrowRight, Check, Minus, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { getPublishedStories, type PublicContentResult, type PublicStorySummary } from "@/components/public/content-source";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ServiceIcon } from "@/components/shared/service-icon";
import { LANDING_FAQ } from "@/components/public/faq";
import { FaqItem } from "@/components/public/faq-item";
import { BookingIntl } from "@/components/directory/booking-intl";
import { DoctorSearchBar } from "@/components/directory/doctor-search-bar";
import { HeroArt } from "@/components/public/hero-art";
import { ArrowLink, Container } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { PROVIDER_ROLES, signupHref } from "@/components/public/routes";
import { ServiceFinder, type FinderLabels } from "@/components/public/service-finder";
import { Link } from "@/i18n/navigation";

export function generateMetadata() {
  return publicPageMetadata("landing", "/");
}

const HOW_STEPS = ["select", "request", "accept", "service", "records"] as const;
const DOCTOR_POINTS = ["choose", "accept", "records"] as const;
const LAB_STEPS = ["choose", "collect", "process", "report"] as const;
const CARE_EXAMPLES = ["recovery", "elderly", "shifts"] as const;
const TRUST_CHECKS = ["identity", "registration", "coverage", "pricing"] as const;
const TRUST_LIMITS = ["ratings", "outcomes", "instant"] as const;

export default async function LandingPage() {
  const t = await getTranslations("public.landing");
  const stories = await getPublishedStories(await getLocale());
  const finderLabels: FinderLabels = {
    pinLabel: t("finder.pinLabel"),
    pinHint: t("finder.pinHint"),
    serviceLegend: t("finder.serviceLegend"),
    submit: t("finder.submit"),
    submitting: t("finder.submitting"),
    noSignIn: t("finder.noSignIn"),
    errors: {
      pinRequired: t("finder.errors.pinRequired"),
      pinInvalid: t("finder.errors.pinInvalid"),
      serviceRequired: t("finder.errors.serviceRequired"),
      offline: t("finder.errors.offline"),
      invalidLink: t("finder.errors.invalidLink"),
    },
  };

  return (
    <>
      <Hero />

      {/* 3. Location and service finder */}
      <section id="finder" aria-labelledby="finder-title" className="relative scroll-mt-20 bg-mist py-16 md:py-24">
        <Container className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="grid content-start gap-4 lg:col-span-5">
            <h2 id="finder-title" className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
              {t("finder.title")}
            </h2>
            <p className="measure text-lg text-muted">{t("finder.description")}</p>
          </div>
          <div className="rounded-lg bg-surface p-5 shadow-raised sm:p-8 lg:col-span-7">
            <ServiceFinder labels={finderLabels} />
          </div>
        </Container>
      </section>

      <ServicePathways />
      <HowItWorks />
      <Trust />
      <AboutBlock />
      <StoriesBlock stories={stories} />
      <MembershipsBlock />
      <ProvidersBlock />
      <FaqBlock />
    </>
  );
}

/* 2. Hero */
function Hero() {
  const t = useTranslations("public.landing.hero");
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden">
      <Container className="grid items-center gap-10 pt-10 pb-14 md:pt-16 lg:grid-cols-12 lg:gap-8 lg:pt-20 lg:pb-24">
        <div className="grid gap-7 lg:col-span-7">
          <h1
            id="hero-title"
            className="scv-rise max-w-[14ch] font-display text-display leading-[1.02] font-medium tracking-[-0.03em] text-ink"
          >
            {t("title")}
          </h1>
          <p className="scv-rise scv-rise-delay measure text-xl leading-relaxed text-muted">{t("lead")}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ArrowLink href="/#finder">{t("primary")}</ArrowLink>
            <ArrowLink href="/how-it-works">{t("secondary")}</ArrowLink>
          </div>
          <p className="flex items-center gap-2 text-base text-muted">
            <Phone aria-hidden className="size-4 text-danger" />
            <Link href="/emergency" className="inline-flex min-h-target items-center underline decoration-border-strong underline-offset-4 hover:text-ink">
              {t("note")}
            </Link>
          </p>
        </div>
        <HeroArt className="mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none lg:translate-y-6" />
        {/* R-C2-4: fe-c's DoctorSearchBar (same /doctors?q=&city=|pin= contract). */}
        <BookingIntl>
          <DoctorSearchBar idPrefix="hero" className="lg:col-span-12" />
        </BookingIntl>
      </Container>
    </section>
  );
}

/* 4. Four distinct service pathways */
function ServicePathways() {
  const t = useTranslations("public.landing.services");
  const tc = useTranslations("common.services");
  return (
    <section aria-labelledby="services-title" className="py-16 md:py-24">
      <Container className="grid gap-4 pb-12 md:pb-16">
        <h2 id="services-title" className="max-w-3xl font-display text-3xl font-medium tracking-[-0.02em] text-ink">
          {t("title")}
        </h2>
        <p className="measure text-lg text-muted">{t("description")}</p>
      </Container>

      {/* Doctors: statement + definition list */}
      <Container className="grid gap-10 border-t border-border py-12 md:py-16 lg:grid-cols-12">
        <div className="grid content-start gap-4 lg:col-span-5">
          <p className="flex items-center gap-2 text-base font-semibold text-forest">
            <ServiceIcon name="stethoscope" className="size-5" />
            {tc("doctors.label")}
          </p>
          <h3 className="font-display text-[clamp(1.875rem,1.4rem+1.8vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.02em] text-ink">
            {t("doctors.title")}
          </h3>
          <p className="text-lg text-muted">{t("doctors.body")}</p>
          <ArrowLink href="/doctors">{t("doctors.cta")}</ArrowLink>
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <dl className="divide-y divide-border border-y border-border">
            {DOCTOR_POINTS.map((k) => (
              <div key={k} className="grid gap-1 py-5 sm:grid-cols-[13rem_1fr] sm:gap-6">
                <dt className="font-semibold text-ink">{t(`doctors.points.${k}.term`)}</dt>
                <dd className="text-muted">{t(`doctors.points.${k}.detail`)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted">{t("doctors.caveat")}</p>
        </div>
      </Container>

      {/* Lab tests: sample journey rail */}
      <Container className="grid gap-10 border-t border-border py-12 md:py-16">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="grid content-start gap-4 lg:col-span-6 lg:col-start-7 lg:row-start-1">
            <p className="flex items-center gap-2 text-base font-semibold text-forest">
              <ServiceIcon name="flask" className="size-5" />
              {tc("labTests.label")}
            </p>
            <h3 className="font-display text-[clamp(1.875rem,1.4rem+1.8vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.02em] text-ink">
              {t("labTests.title")}
            </h3>
            <p className="text-lg text-muted">{t("labTests.body")}</p>
          </div>
          <div className="flex items-end lg:col-span-5 lg:row-start-1">
            <ArrowLink href="/lab-tests">{t("labTests.cta")}</ArrowLink>
          </div>
        </div>
        <ol className="relative grid gap-6 sm:grid-cols-4 sm:gap-4">
          <span aria-hidden className="absolute top-3 right-[12.5%] left-[12.5%] hidden h-px bg-forest/40 sm:block" />
          <span aria-hidden className="absolute top-3 bottom-3 left-3 w-px bg-forest/40 sm:hidden" />
          {LAB_STEPS.map((k, i) => (
            <li key={k} className="relative flex items-start gap-4 sm:flex-col sm:items-center sm:gap-3 sm:text-center">
              <span className="relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-forest bg-paper text-xs font-bold text-forest tabular">
                {i + 1}
              </span>
              <span className="text-base font-medium text-ink">{t(`labTests.steps.${k}`)}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">{t("labTests.caveat")}</p>
      </Container>

      {/* Ambulance: dark band with emergency separation */}
      <div className="bg-forest-strong text-on-forest">
        <Container className="grid gap-10 py-14 md:py-20 lg:grid-cols-12">
          <div className="grid content-start gap-4 lg:col-span-6">
            <p className="flex items-center gap-2 text-base font-semibold text-on-forest-muted">
              <ServiceIcon name="ambulance" className="size-5" />
              {tc("ambulances.label")}
            </p>
            <h3 className="font-display text-[clamp(1.875rem,1.4rem+1.8vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.02em]">
              {t("ambulances.title")}
            </h3>
            <p className="text-lg text-on-forest-muted">{t("ambulances.body")}</p>
            <div>
              <Button asChild variant="onForest" size="lg">
                <Link href="/ambulances">{t("ambulances.cta")}</Link>
              </Button>
            </div>
          </div>
          <aside
            aria-labelledby="amb-emergency"
            className="grid content-start gap-3 rounded-lg bg-paper p-6 text-ink shadow-overlay sm:p-8 lg:col-span-5 lg:col-start-8"
          >
            <h4 id="amb-emergency" className="flex items-center gap-2 text-xl font-semibold text-danger">
              <Phone aria-hidden className="size-5" />
              {t("ambulances.emergencyTitle")}
            </h4>
            <p className="text-base text-ink">{t("ambulances.emergencyBody")}</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button asChild variant="danger">
                <a href="tel:108">
                  <Phone aria-hidden />
                  108
                </a>
              </Button>
              <ArrowLink href="/emergency">{t("ambulances.emergencyLink")}</ArrowLink>
            </div>
          </aside>
        </Container>
      </div>

      {/* Caretakers: typographic list on a warm panel */}
      <Container className="pt-12 md:pt-16">
        <div className="grid gap-10 rounded-lg bg-paper-deep p-6 sm:p-10 lg:grid-cols-12 lg:p-14">
          <div className="grid content-start gap-4 lg:col-span-5">
            <p className="flex items-center gap-2 text-base font-semibold text-forest">
              <ServiceIcon name="care" className="size-5" />
              {tc("caretakers.label")}
            </p>
            <h3 className="font-display text-[clamp(1.875rem,1.4rem+1.8vw,2.75rem)] leading-[1.1] font-medium tracking-[-0.02em] text-ink">
              {t("caretakers.title")}
            </h3>
            <p className="text-lg text-muted">{t("caretakers.body")}</p>
            <ArrowLink href="/caretakers">{t("caretakers.cta")}</ArrowLink>
          </div>
          <div className="grid content-start gap-6 lg:col-span-6 lg:col-start-7">
            <ul className="grid">
              {CARE_EXAMPLES.map((k) => (
                <li key={k} className="border-b border-ink/10 py-4 font-display text-2xl leading-snug text-ink first:pt-0">
                  {t(`caretakers.examples.${k}`)}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">{t("caretakers.caveat")}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* 5. How it works */
function HowItWorks() {
  const t = useTranslations("public.landing.how");
  return (
    <section aria-labelledby="how-title" className="bg-surface py-16 md:py-24">
      <Container className="grid gap-12">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-3">
            <h2 id="how-title" className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
              {t("title")}
            </h2>
            <p className="measure text-lg text-muted">{t("description")}</p>
          </div>
          <ArrowLink href="/how-it-works">{t("cta")}</ArrowLink>
        </div>
        <ol className="grid gap-8 md:grid-cols-5 md:gap-6">
          {HOW_STEPS.map((k, i) => (
            <li key={k} className="grid content-start gap-3 border-t-2 border-forest pt-5 md:border-forest/70 [&:nth-child(n+4)]:border-forest/40">
              <span className="font-display text-2xl text-forest tabular" aria-hidden>
                {i + 1}
              </span>
              <h3 className="text-lg font-semibold text-ink">{t(`steps.${k}.title`)}</h3>
              <p className="text-base text-muted">{t(`steps.${k}.body`)}</p>
            </li>
          ))}
        </ol>
        <p className="rounded-md bg-mist px-5 py-4 text-base font-medium text-ink">{t("requestNote")}</p>
      </Container>
    </section>
  );
}

/* 6. Trust and verification */
function Trust() {
  const t = useTranslations("public.landing.trust");
  return (
    <section aria-labelledby="trust-title" className="py-16 md:py-24">
      <Container className="grid gap-12 lg:grid-cols-12">
        <div className="grid content-start gap-4 lg:col-span-4">
          <h2 id="trust-title" className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
            {t("title")}
          </h2>
          <p className="text-lg text-muted">{t("description")}</p>
        </div>
        <div className="grid gap-10 sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
          <div className="grid content-start gap-4">
            <h3 className="text-lg font-semibold text-ink">{t("checksTitle")}</h3>
            <ul className="grid gap-3">
              {TRUST_CHECKS.map((k) => (
                <li key={k} className="flex gap-3 text-base text-ink">
                  <Check aria-hidden className="mt-1 size-4.5 shrink-0 text-success" strokeWidth={2.5} />
                  {t(`checks.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid content-start gap-4">
            <h3 className="text-lg font-semibold text-ink">{t("limitsTitle")}</h3>
            <ul className="grid gap-3">
              {TRUST_LIMITS.map((k) => (
                <li key={k} className="flex gap-3 text-base text-ink">
                  <Minus aria-hidden className="mt-1 size-4.5 shrink-0 text-muted" strokeWidth={2.5} />
                  {t(`limits.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* 7. About / Our story */
function AboutBlock() {
  const t = useTranslations("public.landing.about");
  return (
    <section aria-labelledby="about-title" className="border-y border-border bg-paper-deep/60 py-16 md:py-24">
      <Container className="grid gap-8 lg:grid-cols-12">
        <h2 id="about-title" className="font-display text-3xl font-medium tracking-[-0.02em] text-ink lg:col-span-4">
          {t("title")}
        </h2>
        <div className="grid gap-6 lg:col-span-7 lg:col-start-6">
          <p className="font-display text-[clamp(1.375rem,1.1rem+1vw,1.875rem)] leading-[1.4] text-ink">{t("body")}</p>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <ArrowLink href="/about">{t("aboutCta")}</ArrowLink>
            <ArrowLink href="/our-story">{t("storyCta")}</ArrowLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* 8. Stories (honest empty state until real, consented stories are published) */
function StoriesBlock({ stories }: { stories: PublicContentResult<PublicStorySummary[]> }) {
  const t = useTranslations("public.landing.stories");
  return (
    <section aria-labelledby="stories-title" className="py-16 md:py-24">
      <Container className="grid gap-8 lg:grid-cols-12">
        <h2 id="stories-title" className="font-display text-3xl font-medium tracking-[-0.02em] text-ink lg:col-span-4">
          {t("title")}
        </h2>
        {stories.status === "ok" ? (
          <div className="grid gap-6 lg:col-span-7 lg:col-start-6">
            {stories.fixture ? <FixtureNotice /> : null}
            <ul className="grid divide-y divide-border border-y border-border">
              {stories.data.slice(0, 3).map((s) => (
                <li key={s.slug} className="py-5">
                  <Link href={`/stories/${s.slug}`} className="group grid gap-1">
                    <span className="font-display text-xl text-ink group-hover:text-forest group-hover:underline">{s.title}</span>
                    <span className="text-base text-muted">{s.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <ArrowLink href="/stories">{t("cta")}</ArrowLink>
          </div>
        ) : (
          <EmptyState
            icon="stories"
            headingLevel="h3"
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={<ArrowLink href="/stories">{t("cta")}</ArrowLink>}
            className="lg:col-span-7 lg:col-start-6"
          />
        )}
      </Container>
    </section>
  );
}

/* 9. Memberships (informational only) */
function MembershipsBlock() {
  const t = useTranslations("public.landing.memberships");
  return (
    <section aria-labelledby="memberships-title" className="pb-16 md:pb-24">
      <Container>
        <div className="grid gap-4 border-t border-border pt-10 md:grid-cols-12 md:gap-8">
          <h2 id="memberships-title" className="text-xl font-semibold text-ink md:col-span-4">
            {t("title")}
          </h2>
          <div className="grid gap-3 md:col-span-7 md:col-start-6">
            <p className="text-base text-muted">{t("body")}</p>
            <ArrowLink href="/memberships">{t("cta")}</ArrowLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* 10. Become a provider */
function ProvidersBlock() {
  const t = useTranslations("public.landing.providers");
  const icons = { doctor: "stethoscope", lab: "flask", ambulance: "ambulance", caretaker: "care" } as const;
  return (
    <section aria-labelledby="providers-title" className="bg-forest py-16 text-on-forest md:py-24">
      <Container className="grid gap-12 lg:grid-cols-12">
        <div className="grid content-start gap-4 lg:col-span-5">
          <h2 id="providers-title" className="font-display text-3xl font-medium tracking-[-0.02em]">
            {t("title")}
          </h2>
          <p className="text-lg text-on-forest-muted">{t("body")}</p>
          <ArrowLink href="/become-a-provider" className="text-on-forest decoration-on-forest/40 hover:decoration-on-forest focus-visible:outline-paper">
            {t("more")}
          </ArrowLink>
        </div>
        <ul className="grid divide-y divide-on-forest/20 border-y border-on-forest/20 lg:col-span-6 lg:col-start-7">
          {PROVIDER_ROLES.map((role) => (
            <li key={role}>
              <Link
                href={signupHref(role)}
                className="group flex min-h-20 items-center gap-4 py-4 focus-visible:outline-paper"
              >
                <ServiceIcon name={icons[role]} className="size-6 shrink-0 text-on-forest-muted" />
                <span className="grid flex-1">
                  <span className="text-lg font-semibold group-hover:underline group-hover:underline-offset-4">{t(`roles.${role}.title`)}</span>
                  <span className="text-base text-on-forest-muted">{t(`roles.${role}.body`)}</span>
                </span>
                <ArrowRight aria-hidden className="size-5 shrink-0 transition-transform duration-(--scv-duration-fast) group-hover:translate-x-1" />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* 11. FAQ + support */
function FaqBlock() {
  const t = useTranslations("public.landing.faq");
  const tf = useTranslations("public.faqPage.items");
  return (
    <section aria-labelledby="faq-title" className="py-16 md:py-24">
      <Container className="grid gap-10 lg:grid-cols-12">
        <div className="grid content-start gap-4 lg:col-span-4">
          <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
            {t("title")}
          </h2>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <ArrowLink href="/faq">{t("all")}</ArrowLink>
            <ArrowLink href="/contact">{t("contact")}</ArrowLink>
          </div>
        </div>
        <div className="border-t border-border lg:col-span-7 lg:col-start-6">
          {LANDING_FAQ.map((id) => (
            <FaqItem key={id} id={id} question={tf(`${id}.q`)} answer={tf(`${id}.a`)} />
          ))}
        </div>
      </Container>
    </section>
  );
}
