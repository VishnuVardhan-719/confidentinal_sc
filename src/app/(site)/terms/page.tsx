import Link from "next/link";
import { DraftNotice, PageIntro, Pending, RelatedPages, Toc } from "@/components/marketing/page-parts";
import { pageMetadata } from "@/components/marketing/seo";

export const metadata = pageMetadata(
  "terms",
  "Terms of use (draft)",
  "Draft terms of use for SureCure Visit. Not approved and not in force.",
);

const sections = [
  { id: "who", label: "Who these terms are with" },
  { id: "site", label: "Using this site today" },
  { id: "service", label: "How bookings will work" },
  { id: "money", label: "Prices, payment and refunds" },
  { id: "safety", label: "Emergencies and medical advice" },
  { id: "changes", label: "Changes and contact" },
] as const;

export default function TermsPage() {
  return (
    <div className="frame page">
      <PageIntro
        title="Terms of use"
        lead="The rules for using SureCure Visit. This is an outline for review, not a finished agreement."
      />
      <DraftNotice subject="set of terms" />
      <div className="mk-split">
        <Toc items={sections} />
        <div className="mk-legal">
          <section aria-labelledby="who">
            <h2 id="who">Who these terms are with</h2>
            <p>
              These terms will be an agreement between you and the business that runs SureCure Visit.{" "}
              <Pending>legal entity name, registered address and registration details</Pending>
            </p>
          </section>

          <section aria-labelledby="site">
            <h2 id="site">Using this site today</h2>
            <p>
              The site currently gives general information about a service that has not launched. Nothing on it can be
              booked or paid for, and no providers are listed.
            </p>
          </section>

          <section aria-labelledby="service">
            <h2 id="service">How bookings will work</h2>
            <ul>
              <li>You choose a provider and send a request.</li>
              <li>The provider decides whether to accept. A request is not a booking until it is accepted.</li>
              <li>Only providers that have been reviewed can be booked, and only in areas that have been checked.</li>
              <li>The provider is responsible for the service they deliver.</li>
            </ul>
            <p>
              The split of responsibility between SureCure Visit and providers will be set out here.{" "}
              <Pending>platform and provider responsibilities, disputes</Pending>
            </p>
          </section>

          <section aria-labelledby="money">
            <h2 id="money">Prices, payment and refunds</h2>
            <p>
              Providers set their own prices. The price will be fixed when you send your request. No payments are
              taken through this site today.
            </p>
            <p>
              Cancellation windows, fees, no-show rules and refunds have not been decided. None apply today.{" "}
              <Pending>cancellation, refund and payment policy</Pending>
            </p>
          </section>

          <section aria-labelledby="safety">
            <h2 id="safety">Emergencies and medical advice</h2>
            <p>
              SureCure Visit is not an emergency service. In an emergency in India, call <a href="tel:112">112</a>.
              Scheduled ambulance is for planned journeys only.
            </p>
            <p>Information on this site is general and is not medical advice.</p>
          </section>

          <section aria-labelledby="changes">
            <h2 id="changes">Changes and contact</h2>
            <p>
              When the terms change, the date and a summary of changes will be shown here.{" "}
              <Pending>governing law, effective date and contact point</Pending>
            </p>
            <p>
              See also the draft <Link href="/privacy">privacy notice</Link>.
            </p>
          </section>
        </div>
      </div>
      <RelatedPages current="terms" keys={["privacy", "faq", "contact"]} />
    </div>
  );
}
