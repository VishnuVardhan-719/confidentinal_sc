import Link from "next/link";
import { DraftNotice, PageIntro, Pending, RelatedPages, Toc } from "@/components/marketing/page-parts";
import { pageMetadata } from "@/components/marketing/seo";

export const metadata = pageMetadata(
  "privacy",
  "Privacy notice (draft)",
  "Draft privacy notice for SureCure Visit. Not approved and not in force.",
);

const sections = [
  { id: "today", label: "What this site collects today" },
  { id: "who", label: "Who is responsible" },
  { id: "later", label: "When the service opens" },
  { id: "sharing", label: "Who can see what" },
  { id: "rights", label: "Your choices and requests" },
  { id: "law", label: "Law and review" },
] as const;

export default function PrivacyPage() {
  return (
    <div className="frame page">
      <PageIntro
        title="Privacy notice"
        lead="How SureCure Visit plans to handle personal information. This is an outline for review, not a finished notice."
      />
      <DraftNotice subject="privacy notice" />
      <div className="mk-split">
        <Toc items={sections} />
        <div className="mk-legal">
          <section aria-labelledby="today">
            <h2 id="today">What this site collects today</h2>
            <p>
              The site is information only. There are no accounts and no bookings, and the{" "}
              <Link href="/contact">contact form</Link> is not connected, so what you type into it is not sent or
              stored.
            </p>
            <p>
              Like most websites, the hosting service may keep standard technical logs, such as IP addresses and the
              pages requested. <Pending>hosting provider, log contents and retention period</Pending>
            </p>
          </section>

          <section aria-labelledby="who">
            <h2 id="who">Who is responsible</h2>
            <p>
              The organisation responsible for your personal information will be named here.{" "}
              <Pending>legal entity name, address and grievance contact</Pending>
            </p>
          </section>

          <section aria-labelledby="later">
            <h2 id="later">When the service opens</h2>
            <p>To provide the service, the following are expected to be collected:</p>
            <ul>
              <li>Your name, phone number, and address with PIN code, to create an account and arrange visits.</li>
              <li>
                A health questionnaire before your first booking. Every question accepts “Unknown” or “None”, and
                documents are optional.
              </li>
              <li>Booking details: which provider you chose, the service, the time and the price.</li>
              <li>For providers: identity and credential documents, used only for review.</li>
            </ul>
            <p>
              The purpose, legal basis and retention period for each item will be listed here.{" "}
              <Pending>purposes, consent wording and retention periods</Pending>
            </p>
          </section>

          <section aria-labelledby="sharing">
            <h2 id="sharing">Who can see what</h2>
            <ul>
              <li>A provider sees the details of a booking only when they are assigned to it.</li>
              <li>Clinical records are not open to SureCure Visit staff by default.</li>
              <li>Being linked as family does not give another adult access to your records.</li>
              <li>Private documents are stored privately and shared only through short-lived links.</li>
            </ul>
            <p>
              Service providers that host or process data for us will be listed here.{" "}
              <Pending>list of processors and where data is stored</Pending>
            </p>
          </section>

          <section aria-labelledby="rights">
            <h2 id="rights">Your choices and requests</h2>
            <p>
              You will be able to ask to see, correct or delete your information, and to withdraw consent. How to make
              a request and how long a reply takes will be set out here.{" "}
              <Pending>request process, response times and grievance officer</Pending>
            </p>
          </section>

          <section aria-labelledby="law">
            <h2 id="law">Law and review</h2>
            <p>
              The final notice is expected to be written against India’s Digital Personal Data Protection Act, 2023
              and the Digital Personal Data Protection Rules, 2025. Which parts apply, and from when, is still to be
              confirmed by a lawyer. This draft is not legal advice.
            </p>
          </section>
        </div>
      </div>
      <RelatedPages current="privacy" keys={["terms", "accessibility", "contact"]} />
    </div>
  );
}
