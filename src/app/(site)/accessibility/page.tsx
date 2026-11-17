import Link from "next/link";
import { PageIntro, RelatedPages, Toc } from "@/components/marketing/page-parts";
import { pageMetadata } from "@/components/marketing/seo";

export const metadata = pageMetadata(
  "accessibility",
  "Accessibility",
  "The accessibility standard SureCure Visit is working towards, what is in place, and the known gaps.",
);

const sections = [
  { id: "aim", label: "What we aim for" },
  { id: "done", label: "What is in place" },
  { id: "gaps", label: "Known gaps" },
  { id: "tell", label: "Telling us about a problem" },
] as const;

export default function AccessibilityPage() {
  return (
    <div className="frame page">
      <PageIntro
        title="Accessibility"
        lead="SureCure Visit should be usable by everyone who needs care arranged, including people using a keyboard, a screen reader, a small phone or a slow connection."
      />
      <div className="mk-split">
        <Toc items={sections} />
        <div className="mk-legal">
          <section aria-labelledby="aim">
            <h2 id="aim">What we aim for</h2>
            <p>
              The target is the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. The site has not been
              independently audited, so we do not claim that it conforms yet.
            </p>
          </section>

          <section aria-labelledby="done">
            <h2 id="done">What is in place</h2>
            <ul>
              <li>A “Skip to main content” link as the first thing on every page.</li>
              <li>Every link, button and form field can be reached and used with a keyboard, with a visible focus ring.</li>
              <li>Tap targets are at least 44 pixels high.</li>
              <li>Text colours are chosen to meet AA contrast on their backgrounds.</li>
              <li>Animation is switched off when your device asks for reduced motion.</li>
              <li>Form fields have visible labels, and errors are written next to the field they belong to.</li>
              <li>Questions on the FAQ page open and close without JavaScript.</li>
            </ul>
          </section>

          <section aria-labelledby="gaps">
            <h2 id="gaps">Known gaps</h2>
            <ul>
              <li>The site is in English only. Telugu and Hindi are planned.</li>
              <li>Testing so far has been automated checks and manual keyboard use, not testing with disabled users.</li>
              <li>Pages for booking and accounts do not exist yet and will need their own testing.</li>
            </ul>
          </section>

          <section aria-labelledby="tell">
            <h2 id="tell">Telling us about a problem</h2>
            <p>
              A working channel for accessibility feedback is not set up yet. The{" "}
              <Link href="/contact">contact form</Link> has an accessibility topic, but it is not connected, so messages
              are not sent. This section will name a contact once one exists.
            </p>
            <p className="text-[0.9375rem] text-[var(--ink-soft)]">Last reviewed: November 2026.</p>
          </section>
        </div>
      </div>
      <RelatedPages current="accessibility" keys={["contact", "privacy", "faq"]} />
    </div>
  );
}
