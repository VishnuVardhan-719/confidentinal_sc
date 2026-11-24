import type { FAQPage, Organization, WebSite, WithContext } from "schema-dts";
import { LEADERS } from "@/components/public/leadership";
import { SITE_URL } from "@/components/public/seo";
import type { AppLocale } from "@/i18n/routing";

/**
 * schema.org JSON-LD for search engines and AI answer engines. Only facts the site really states go in
 * here: no ratings, no review counts, no prices, no coverage areas and no opening hours. Typed with
 * Google's schema-dts so a wrong property fails the typecheck.
 */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/** JSON-LD is parsed as data, but "<" is escaped so a stray "</script>" in copy can never close the tag. */
export const jsonLdString = (data: object): string => JSON.stringify(data).replace(/</g, "\\u003c");

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}

export function organizationSchema(description: string): WithContext<Organization> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "SureCure Visit",
    alternateName: ["SureCureVisit", "SureCure Visit Healthcare"],
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/logo-full.webp`, width: "800", height: "800" },
    image: `${SITE_URL}/opengraph-image.png`,
    description,
    slogan: "Healthcare at your doorstep",
    founder: LEADERS.filter((l) => l.id !== "director").map((l) => ({
      "@type": "Person" as const,
      name: l.name,
      jobTitle: l.role,
    })),
  };
}

export function websiteSchema(locale: AppLocale, description: string): WithContext<WebSite> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: "SureCure Visit",
    alternateName: "SureCureVisit",
    description,
    inLanguage: locale,
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/** FAQPage. Every question and answer must also be visible on the page it is attached to. */
export function faqSchema(entries: readonly { q: string; a: string }[]): WithContext<FAQPage> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question" as const,
      name: e.q,
      acceptedAnswer: { "@type": "Answer" as const, text: e.a },
    })),
  };
}
