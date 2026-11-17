/** Production origin from the docs (surecurevisit.in). Used for metadataBase, canonical URLs, sitemap and robots. */
export const SITE_URL = "https://surecurevisit.in";
export const SITE_NAME = "SureCure Visit";

export type PublicPage = {
  path: string;
  label: string;
  /** One line used in "related pages" lists. Restates the page; no new claims. */
  blurb: string;
  /** Draft legal pages stay out of the sitemap and are marked noindex until approved. */
  draft?: boolean;
};

/** Public pages owned by the (site) route group. */
export const sitePages = {
  about: { path: "/about", label: "About", blurb: "What SureCure Visit is, and what it is not." },
  faq: { path: "/faq", label: "Questions", blurb: "Short answers about booking, prices and safety." },
  providers: {
    path: "/providers",
    label: "For providers",
    blurb: "How doctors, labs, ambulance operators and caretakers will join.",
  },
  contact: { path: "/contact", label: "Contact", blurb: "The contact form, and what it can and cannot do today." },
  accessibility: {
    path: "/accessibility",
    label: "Accessibility",
    blurb: "What we test for, and the known gaps.",
  },
  privacy: { path: "/privacy", label: "Privacy (draft)", blurb: "Draft privacy notice, not in force.", draft: true },
  terms: { path: "/terms", label: "Terms (draft)", blurb: "Draft terms of use, not in force.", draft: true },
} as const satisfies Record<string, PublicPage>;

export type SitePageKey = keyof typeof sitePages;
