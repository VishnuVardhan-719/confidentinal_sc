import Link from "next/link";
import { FaqAccordion, type FaqItem } from "@/components/marketing/faq-accordion";
import { PageIntro, RelatedPages, Toc } from "@/components/marketing/page-parts";
import { pageMetadata } from "@/components/marketing/seo";
import { isEnabled } from "@/lib/feature-flags";

export const metadata = pageMetadata(
  "faq",
  "Questions",
  "Short answers about SureCure Visit before launch: booking status, who sets prices, provider checks and emergencies.",
);

type Group = { id: string; title: string; items: FaqItem[] };

// Every answer restates a rule in README/docs (PRODUCT_REQUIREMENTS, ROLE_ONBOARDING_AND_PERMISSIONS,
// BUSINESS_RULES_AND_APPROVAL_MATRIX, S00_DECISION_SHEET). Undecided policies are answered as undecided.
function groups(): Group[] {
  const payments = isEnabled("livePayments");
  const dispatch = isEnabled("emergencyDispatch");
  return [
    {
      id: "booking",
      title: "Booking",
      items: [
        {
          id: "booking-open",
          question: "Can I book a visit today?",
          answer: (
            <p>
              No. Online booking is not open yet. This site explains how the service will work before it launches.
              Nothing can be booked or paid for here today.
            </p>
          ),
        },
        {
          id: "booking-accept",
          question: "When does a request become a booking?",
          answer: (
            <>
              <p>
                Only when the provider accepts it. You choose the provider and send a request. The provider reviews it
                and accepts or declines. Until they accept, nothing is confirmed.
              </p>
              <p>
                <Link href="/how-it-works">Read how it works</Link>
              </p>
            </>
          ),
        },
        {
          id: "booking-account",
          question: "Do I need an account to look around?",
          answer: (
            <p>
              No. Public pages can be read without signing in. An account will be needed to send a request once booking
              opens.
            </p>
          ),
        },
        {
          id: "booking-health",
          question: "Will I have to answer health questions before booking?",
          answer: (
            <p>
              The plan is a short health questionnaire before your first non-emergency booking. Every question will
              accept honest answers such as “Unknown”, “None” or “No documents available”, so you never have to guess
              or upload something you do not have.
            </p>
          ),
        },
        {
          id: "booking-cancel",
          question: "What are the cancellation and refund rules?",
          answer: (
            <p>
              They have not been decided yet. No cancellation fees, refund windows or no-show rules apply today. The
              rules will be shown to you before you send a request, once they are approved.
            </p>
          ),
        },
      ],
    },
    {
      id: "prices",
      title: "Prices and payment",
      items: [
        {
          id: "prices-who",
          question: "Who sets the price?",
          answer: (
            <p>
              Each provider sets their own price. SureCure Visit does not publish prices today because no providers are
              listed yet.
            </p>
          ),
        },
        {
          id: "prices-pay",
          question: "How will I pay?",
          answer: payments ? (
            <p>The payment options for a service are shown before you confirm a request.</p>
          ) : (
            <p>
              Payments are not switched on. No money can be taken through this site, and no booking will show as paid.
              Payment options will be explained before they are offered.
            </p>
          ),
        },
      ],
    },
    {
      id: "providers",
      title: "Providers and coverage",
      items: [
        {
          id: "providers-checked",
          question: "Are providers checked before they can take bookings?",
          answer: (
            <>
              <p>
                Yes, that is the rule. Providers submit identity and credential evidence along with their services,
                prices and service areas. A SureCure Visit administrator reviews the application, and a provider can
                only be booked after approval.
              </p>
              <p>
                <Link href="/providers">See the joining process</Link>
              </p>
            </>
          ),
        },
        {
          id: "providers-area",
          question: "Which areas do you cover?",
          answer: (
            <p>
              None yet. You will be able to browse from anywhere, but a provider can only be booked where their service
              area has been checked. If no checked provider covers your PIN code, the site will tell you so.
            </p>
          ),
        },
        {
          id: "providers-caretaker",
          question: "Can a caretaker give medicines or medical treatment?",
          answer: (
            <p>
              No. Caretaker support is non-clinical help, such as companionship and help with daily routines.
              Caretakers cannot prescribe medicines or write clinical notes.
            </p>
          ),
        },
      ],
    },
    {
      id: "safety",
      title: "Safety and privacy",
      items: [
        {
          id: "safety-emergency",
          question: "Is SureCure Visit an emergency service?",
          answer: dispatch ? (
            <p>
              In an emergency in India, call <a href="tel:112">112</a> first.
            </p>
          ) : (
            <p>
              No. In an emergency in India, call <a href="tel:112">112</a>. Scheduled ambulance on SureCure Visit is
              only for planned, non-emergency journeys arranged in advance.
            </p>
          ),
        },
        {
          id: "safety-family",
          question: "Can my family members see my health records?",
          answer: (
            <p>
              Not automatically. Being linked as family does not give another adult access to your records. Access
              will need your specific permission.
            </p>
          ),
        },
        {
          id: "safety-language",
          question: "Which languages will the site support?",
          answer: (
            <p>
              English, Telugu and Hindi are planned. The site is in English only for now.
            </p>
          ),
        },
      ],
    },
  ];
}

export default function FaqPage() {
  const all = groups();
  return (
    <div className="frame page">
      <PageIntro
        title="Questions"
        lead="Straight answers about the service before it opens. Where something has not been decided yet, we say so."
      />
      <div className="mk-split">
        <Toc title="Topics" items={all.map((g) => ({ id: g.id, label: g.title }))} />
        <div>
          {all.map((g) => (
            <section key={g.id} className="mk-faq-group" aria-labelledby={g.id}>
              <h2 id={g.id}>{g.title}</h2>
              <FaqAccordion items={g.items} />
            </section>
          ))}
          <div className="notice mt-12">
            <p className="notice-title">Did not find your answer?</p>
            <p>
              The <Link href="/contact">contact page</Link> explains what you can do today. In an emergency in India,
              call <a href="tel:112">112</a>.
            </p>
          </div>
        </div>
      </div>
      <RelatedPages current="faq" keys={["providers", "about", "contact"]} />
    </div>
  );
}
