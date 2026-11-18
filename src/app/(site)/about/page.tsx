import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { PageIntro, RelatedPages } from "@/components/marketing/page-parts";
import { pageMetadata } from "@/components/marketing/seo";

export const metadata = pageMetadata(
  "about",
  "About",
  "What SureCure Visit is for, the rules it is being built on, and what it is not.",
);

const principles = [
  {
    term: "You choose the provider",
    detail: "You pick who you want to send a request to. No one is assigned to you without your choice.",
  },
  {
    term: "The provider accepts",
    detail: "A request becomes a booking only when the provider says yes. Until then, nothing is confirmed.",
  },
  {
    term: "Only checked providers can be booked",
    detail:
      "Providers are reviewed before they can take requests, and only in service areas that have been checked. Browsing is open to everyone.",
  },
  {
    term: "Providers set their prices",
    detail: "The price you see will come from the provider, and it will be fixed when you send your request.",
  },
  {
    term: "No made-up claims",
    detail:
      "No invented ratings, reviews, waiting times or coverage. If something is not available, the site says so.",
  },
  {
    term: "Your records stay private",
    detail:
      "Health information is only for the people you allow. Being linked as family does not give another adult access.",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="frame page">
      <PageIntro
        title="A clearer way to arrange care at home"
        lead="SureCure Visit is a service for people in India to find and request a doctor visit, a lab test, a scheduled ambulance journey or non-clinical caretaker support, from providers they choose."
      />

      <section className="pb-16" aria-labelledby="principles-title">
        <div className="section-header">
          <h2 id="principles-title">The rules it is built on</h2>
        </div>
        <dl className="mk-principles">
          {principles.map((p) => (
            <div key={p.term}>
              <dt>{p.term}</dt>
              <dd>{p.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="prose" aria-labelledby="not-title">
        <h2 id="not-title">What SureCure Visit is not</h2>
        <ul>
          <li>
            It is not an emergency service. In an emergency in India, call <a href="tel:112">112</a>.
          </li>
          <li>It is not medical advice. Information on this site is general.</li>
          <li>Caretaker support is not medical treatment.</li>
        </ul>

        <h2 id="status-title">Where things stand</h2>
        <p>
          The service is being built and has not launched. Online booking is not open, no providers are listed, and no
          payments are taken. The legal business details will be published here once they are confirmed.
        </p>
        <div className="actions">
          <ButtonLink href="/categories">Explore services</ButtonLink>
          <Link className="text-link" href="/how-it-works">
            How it works
          </Link>
        </div>
      </section>

      <RelatedPages current="about" keys={["faq", "providers", "contact"]} />
    </div>
  );
}
