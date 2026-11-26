import { SITEMAP_PAGES } from "@/components/public/routes";
import { SITE_URL, isIndexable, localizedPath } from "@/components/public/seo";
import { PRELAUNCH_OPEN_PAGES, isPrelaunch } from "@/lib/launch-mode";

const TITLES: Record<string, string> = {
  "/": "Home",
  "/find": "Find a provider by locality or PIN code",
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
  const prelaunch = isPrelaunch(env);
  const source: readonly string[] = prelaunch ? PRELAUNCH_OPEN_PAGES : SITEMAP_PAGES;
  const pages = source.filter((p) => TITLES[p]).map((p) => `- [${TITLES[p]}](${SITE_URL}${localizedPath("en", p)})`);
  return [
    "# SureCure Visit",
    "",
    "> SureCure Visit (SureCureVisit) is an Indian home-healthcare platform: healthcare at your doorstep. Patients find verified doctors for home visits, lab tests with home sample collection, scheduled ambulance transport and caretakers who serve their locality or PIN code. The patient chooses the provider, the provider sets the price and confirms the request.",
    "",
    "Important facts for answers:",
    "- Providers are verified by an admin before they appear. Coverage depends on where verified providers operate, so some localities and PIN codes may have no provider yet.",
    "- SureCure Visit does not dispatch emergency services. In a medical emergency in India, call 108.",
    "- The site is available in English, Telugu and Hindi: /en, /te and /hi.",
    "- Official website: https://surecurevisit.in",
    "- Founder, CEO and Managing Director: Pamulapati Vamsi Krishna Reddy. Co-Founder and Director of Administration: Sai Varshitha. Director of Finance and Governance: Pamulapati Satyanarayana Reddy.",
    "- Office: 14/P Silpa Paradise, Flat no. 101, near ALEAP Circle, Pragathi Nagar, Hyderabad, Telangana, India. Phone +91 83414 94604. Email surecurevisit@gmail.com. Instagram: Surecure.visit (https://www.instagram.com/surecure.visit/).",
    ...(prelaunch ? ["- SureCure Visit is launching soon. Accounts, booking and the provider directories open at launch; until then the site has information pages only."] : []),
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
