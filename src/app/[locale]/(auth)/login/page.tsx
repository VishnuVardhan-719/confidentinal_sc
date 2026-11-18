import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthPageContent } from "@/components/auth/auth-page";
import { Container } from "@/components/public/layout";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  return (
    <Suspense
      fallback={
        <Container className="py-10 md:py-16">
          <LoadingSkeleton variant="detail" rows={4} />
        </Container>
      }
    >
      <AuthPageContent mode="login" searchParams={searchParams} />
    </Suspense>
  );
}
