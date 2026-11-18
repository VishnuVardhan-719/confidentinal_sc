import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { getPublishedStories } from "@/components/public/content-source";
import { Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { EmptyState } from "@/components/shared/empty-state";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Link } from "@/i18n/navigation";

export function generateMetadata() {
  return publicPageMetadata("stories", "/stories");
}

export default async function StoriesPage() {
  const t = await getTranslations("public.storiesPage");
  const locale = await getLocale();
  const format = await getFormatter();
  const result = await getPublishedStories(locale);

  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")} />
      <Container className="grid gap-6 pb-20">
        {result.status === "ok" && result.fixture ? <FixtureNotice /> : null}
        {result.status === "ok" ? (
          <ul className="grid divide-y divide-border border-y border-border">
            {result.data.map((s) => (
              <li key={s.slug} className="py-6">
                <Link href={`/stories/${s.slug}`} className="group grid gap-2">
                  <span className="font-display text-2xl text-ink group-hover:text-forest group-hover:underline">{s.title}</span>
                  <span className="measure text-base text-muted">{s.summary}</span>
                  <time dateTime={s.publishedAt} className="text-sm text-muted">
                    {format.dateTime(new Date(s.publishedAt), { dateStyle: "long", timeZone: "Asia/Kolkata" })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        ) : result.status === "unavailable" ? (
          <InlineError code="unavailable" />
        ) : (
          <EmptyState
            icon="stories"
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              <Button asChild variant="secondary">
                <Link href="/how-it-works">{t("emptyCta")}</Link>
              </Button>
            }
            className="max-w-3xl"
          />
        )}
      </Container>
    </>
  );
}
