import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageIntro, RelatedPages } from "@/components/marketing/page-parts";
import { pageMetadata } from "@/components/marketing/seo";

export const metadata = pageMetadata(
  "providers",
  "For providers",
  "How doctors, labs, scheduled ambulance operators and caretakers will apply to join SureCure Visit, and how applications are reviewed.",
);

// Process and evidence lists restate docs/specs/ROLE_ONBOARDING_AND_PERMISSIONS.md and PRODUCT_REQUIREMENTS.md.
const steps = [
  {
    title: "Create an account",
    body: "Sign up and verify your phone number. You can join as an individual or on behalf of an organisation, such as a lab or an ambulance operator.",
  },
  {
    title: "Fill in your profile",
    body: "Add the services you offer, the price you set for each one, and the areas you serve. You can save and come back later.",
  },
  {
    title: "Upload your evidence",
    body: "Upload identity and credential documents for your provider type. Documents are stored privately and are not shown to patients.",
  },
  {
    title: "Wait for review",
    body: "A SureCure Visit administrator reviews your application. You may be asked to correct or add something.",
  },
  {
    title: "Accept requests you can take",
    body: "Once approved, and only in the areas that have been checked, patients can find you and send requests. You accept or decline each one.",
  },
] as const;

const statuses = [
  { label: "Submitted", tone: undefined },
  { label: "Under review", tone: undefined },
  { label: "Changes required", tone: "warn" },
  { label: "Approved", tone: "ok" },
  { label: "Suspended", tone: "warn" },
] as const;

const providerTypes = [
  {
    name: "Doctors",
    evidence: [
      "Government identity document",
      "Medical registration number and the council that issued it",
      "Registration and qualification evidence",
      "Specialty, languages and the areas you will visit",
    ],
    limit: "Only individually approved doctors can be assigned to a visit.",
  },
  {
    name: "Labs",
    evidence: [
      "Legal registration and permits for the lab",
      "Accreditation or certification evidence, where you hold it",
      "Test catalogue with your prices",
      "Branches, home collection areas and working hours",
    ],
    limit: "Sample collectors see only the details of the jobs assigned to them.",
  },
  {
    name: "Scheduled ambulance operators",
    evidence: [
      "Operator registration and permits",
      "Vehicle documents for each vehicle in the fleet",
      "Driver identity and crew qualifications",
      "Equipment carried, base location and service regions",
    ],
    limit: "Scheduled, planned journeys only. Emergency requests are not part of the service.",
  },
  {
    name: "Caretakers and agencies",
    evidence: [
      "Identity document",
      "The checks that apply to your role",
      "Skills, the tasks you can take on, and languages",
      "Availability and the areas you can travel to",
    ],
    limit: "Caretaker work is non-clinical. Caretakers cannot prescribe medicines or write clinical notes.",
  },
] as const;

export default function ProvidersPage() {
  return (
    <div className="frame page">
      <PageIntro
        title="Joining as a provider"
        lead="Doctors, labs, scheduled ambulance operators and caretakers will apply, be reviewed, and then decide which requests to accept. Here is the process as it is planned."
      >
        <div className="notice">
          <p className="notice-title">Applications are not open yet.</p>
          <p>There is no sign-up form yet. This page describes the process so you know what to prepare.</p>
          <div className="actions">
            <Button disabled aria-describedby="apply-closed">
              Apply to join
            </Button>
            <span id="apply-closed" className="text-[0.9375rem] text-[var(--ink-soft)]">
              Not available until applications open
            </span>
          </div>
        </div>
      </PageIntro>

      <section className="section pt-0" aria-labelledby="process-title">
        <div className="section-header">
          <h2 id="process-title">The process</h2>
          <p>Five steps, in this order. You cannot receive requests before the review is complete.</p>
        </div>
        <ol className="mk-process">
          {steps.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="pb-16" aria-labelledby="status-title">
        <div className="section-header">
          <h2 id="status-title">Application status</h2>
          <p>Your application will always show one of these states. Only “Approved” lets patients book you.</p>
        </div>
        <ul className="mk-statuses" aria-label="Possible application states">
          {statuses.map((s) => (
            <li key={s.label} data-tone={s.tone}>
              {s.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="pt-8 pb-16" aria-labelledby="evidence-title">
        <div className="section-header">
          <h2 id="evidence-title">What you will be asked for</h2>
          <p>
            A starting list by provider type. The final list depends on legal and professional review, so it may
            change before applications open.
          </p>
        </div>
        <dl className="mk-evidence">
          {providerTypes.map((p) => (
            <div key={p.name}>
              <dt>{p.name}</dt>
              <dd>
                <ul>
                  {p.evidence.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                <p className="mk-limit">{p.limit}</p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="prose" aria-labelledby="terms-title">
        <h2 id="terms-title">What stays in your hands</h2>
        <ul>
          <li>You set your own prices.</li>
          <li>You accept or decline each request yourself.</li>
          <li>Your private documents, home address and personal phone are never shown on your public profile.</li>
        </ul>
        <p>
          Commission, fees and payouts have not been decided, so this page makes no claim about earnings. Questions
          about joining can go through the <Link href="/contact">contact page</Link>.
        </p>
      </section>

      <RelatedPages current="providers" keys={["faq", "about", "contact"]} />
    </div>
  );
}
