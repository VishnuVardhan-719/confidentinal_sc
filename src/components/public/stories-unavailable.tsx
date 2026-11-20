import { getTranslations } from "next-intl/server";
import { Container, PublicPageIntro } from "@/components/public/layout";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * Story detail while the content backend is gated (no CMS contract yet): a calm "not available
 * yet" page with HTTP 200, not a 404, because the URL may become valid once publishing is on.
 */
export async function StoriesUnavailable() {
  const t = await getTranslations("public.storiesPage");
  return (
    <>
      <PublicPageIntro title={t("title")} />
      <Container className="pb-20">
        <EmptyState
          icon="stories"
          title={t("gatedTitle")}
          description={t("gatedBody")}
          action={
            <Button asChild variant="secondary">
              <Link href="/stories">{t("gatedBack")}</Link>
            </Button>
          }
          className="max-w-3xl"
        />
      </Container>
    </>
  );
}
