import type { Messages } from "@/components/i18n/config";

/*
 * Single source of truth for the public site's header and footer links.
 * tests/unit/site-links.test.ts checks every href here (and every literal internal href in src/)
 * against the real route files, so a renamed or missing page fails the test run.
 */

export type SiteLink = { href: string; label: string };

type Nav = Messages["nav"];
type Cat = Messages["categories"];

/** Header: where a visitor starts. Account actions are separate (they depend on the session). */
export function headerLinks(n: Nav): SiteLink[] {
  return [
    { href: "/categories", label: n.findCare },
    { href: "/how-it-works", label: n.howItWorks },
    { href: "/providers", label: n.providers },
    { href: "/faq", label: n.faq },
  ];
}

export const SIGN_IN_HREF = "/sign-in";
export const SIGN_UP_HREF = "/sign-up";

export type FooterGroup = { id: string; title: string; links: SiteLink[] };

/** Footer: every public page, grouped, so any page has a path to every other one. */
export function footerGroups(m: Messages): FooterGroup[] {
  const n = m.nav;
  const c: Cat = m.categories;
  const g = m.footer.groups;
  return [
    {
      id: "care",
      title: g.care,
      links: [
        { href: "/categories", label: n.findCare },
        { href: "/categories/doctor", label: c.doctor },
        { href: "/categories/lab", label: c.lab },
        { href: "/categories/scheduled-ambulance", label: c.ambulance },
        { href: "/categories/caretaker", label: c.caretaker },
        { href: "/how-it-works", label: n.howItWorks },
      ],
    },
    {
      id: "account",
      title: g.account,
      links: [
        { href: SIGN_IN_HREF, label: n.signIn },
        { href: SIGN_UP_HREF, label: n.createAccount },
        { href: "/providers", label: n.providers },
      ],
    },
    {
      id: "info",
      title: g.info,
      links: [
        { href: "/", label: n.home },
        { href: "/about", label: n.about },
        { href: "/faq", label: n.faq },
        { href: "/contact", label: n.contact },
      ],
    },
    {
      id: "policies",
      title: g.policies,
      links: [
        { href: "/privacy", label: n.privacy },
        { href: "/terms", label: n.terms },
        { href: "/accessibility", label: n.accessibility },
      ],
    },
  ];
}
