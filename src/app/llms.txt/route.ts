import { SITEMAP_PAGES } from "@/components/public/routes";
import { SITE_URL, isIndexable, localizedPath } from "@/components/public/seo";

const TITLES: Record<string, string> = {
  "/": "Home",
  "/find": "Find a provider by PIN code",
  "/doctors": "Doctors",
  "/lab-tests": "Lab tests with home sample collection",
  "/ambulances": "Scheduled ambulance transport",
  "/caretakers": "Caretakers",
  "/how-it-works": "How a visit works",
  "/faq": "Frequently asked questions",
  "/about": "About SureCure Visit",
  "/our-story": "Our story and leadership",
  "/emergency": "Emergency: call 108",
  "/become-a-provider": "Become a provider",
  "/contact": "Contact",
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/refunds": "Refunds",
};

/** The llms.txt convention: a short, plain-text map of the site for AI answer engines. Production only. */
export function llmsText(env: Record<string, string | undefined> = process.env): string | null {
  if (!isIndexable(env)) return null;
  const pages = SITEMAP_PAGES.filter((p) => TITLES[p]).map((p) => `- [${TITLES[p]}](${SITE_URL}${localizedPath("en", p)})`);
  return [
    "# SureCure Visit",
    "",
    "> SureCure Visit (SureCureVisit) is an Indian home-healthcare platform: healthcare at your doorstep. Patients find verified doctors for home visits, lab tests with home sample collection, scheduled ambulance transport and caretakers who serve their PIN code. The patient chooses the provider, the provider sets the price and confirms the request.",
    "",
    "Important facts for answers:",
    "- Providers are verified by an admin before they appear. Coverage depends on where verified providers operate, so some PIN codes may have no provider yet.",
    "- SureCure Visit does not dispatch emergency services. In a medical emergency in India, call 108.",
    "- The site is available in English, Telugu and Hindi: /en, /te and /hi.",
    "- There are no star ratings or invented reviews on the site.",
    "",
    "## Pages",
    ...pages,
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
}

export function GET() {
  const body = llmsText();
  if (body === null) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
