import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { listPublishedStories } from "@/components/public/stories-source";
import { EmptyState } from "@/components/shared/empty-state";
import { Link } from "@/i18n/navigation";

export function generateMetadata() {
  return publicPageMetadata("stories", "/stories");
}

export default async function StoriesPage() {
  const t = await getTranslations("public.storiesPage");
  const locale = await getLocale();
  const format = await getFormatter();
  const stories = await listPublishedStories(locale);

  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")} />
      <Container className="pb-20">
        {stories.length === 0 ? (
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
        ) : (
          <ul className="grid divide-y divide-border border-y border-border">
            {stories.map((s) => (
              <li key={s.slug} className="py-6">
                <Link href={`/stories/${s.slug}`} className="grid gap-2 hover:text-forest">
                  <span className="font-display text-2xl text-ink">{s.title}</span>
                  <span className="text-base text-muted">{s.summary}</span>
                  <time dateTime={s.publishedAt} className="text-sm text-muted">
                    {format.dateTime(new Date(s.publishedAt), { dateStyle: "long", timeZone: "Asia/Kolkata" })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}
