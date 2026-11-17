import Link from "next/link";
import type { ReactNode } from "react";
import { sitePages, type SitePageKey } from "./site";

export function PageIntro({ title, lead, children }: { title: ReactNode; lead: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
      {children}
    </header>
  );
}

/** Marks a legal page as an unapproved draft. Shown above the content, before anything else is read. */
export function DraftNotice({ subject }: { subject: string }) {
  return (
    <aside className="mk-draft" aria-labelledby="draft-label">
      <p id="draft-label" className="mk-draft-label">
        Draft, not in force
      </p>
      <p>
        This {subject} is a working draft. It has not been approved by the business owner or reviewed by a lawyer, and
        it does not name the legal entity behind SureCure Visit because that has not been confirmed yet. Do not rely on
        it. It will be replaced before the service opens.
      </p>
    </aside>
  );
}

/** Text the draft legal pages use wherever a fact is still waiting for the owner or a lawyer. */
export function Pending({ children }: { children: ReactNode }) {
  return (
    <span className="mk-pending">
      [Pending: {children}]
    </span>
  );
}

/** Small index of other public pages, so each page links onward without editing the shared footer. */
export function RelatedPages({ current, keys }: { current: SitePageKey; keys: readonly SitePageKey[] }) {
  const items = keys.filter((k) => k !== current).map((k) => sitePages[k]);
  return (
    <nav className="mk-related" aria-labelledby="related-title">
      <h2 id="related-title" className="notice-title">
        Related pages
      </h2>
      <ul>
        {items.map((p) => (
          <li key={p.path}>
            <Link href={p.path}>{p.label}</Link>
            <p>{p.blurb}</p>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Toc({ title = "On this page", items }: { title?: string; items: readonly { id: string; label: string }[] }) {
  return (
    <nav className="mk-aside" aria-labelledby="toc-title">
      <h2 id="toc-title" className="mk-aside-title">
        {title}
      </h2>
      <ul className="mk-toc">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`}>{i.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
