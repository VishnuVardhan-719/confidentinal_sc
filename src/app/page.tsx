import Link from "next/link";
import { Hero } from "@/components/marketing/hero";
import { RevealScope } from "@/components/motion/reveal-scope";
import { StepTrack } from "@/components/motion/step-track";
import { WordReveal } from "@/components/motion/word-reveal";
import { ServiceIndex } from "@/components/service-index";
import { categories } from "./categories/data";
import { requestSteps } from "./how-it-works/steps";

/** Provider sign-up entry points. The role query is a preselection hint only; sign-up validates it. */
const joinRoles = [
  { role: "doctor", title: "I'm a doctor", summary: "Set your consultation modes, languages and fee." },
  { role: "lab", title: "I run a lab", summary: "List home collection or lab visits, and your hours." },
  { role: "ambulance", title: "I operate scheduled ambulances", summary: "Planned, non-emergency transfers only." },
  { role: "caretaker", title: "I'm a caretaker", summary: "Offer non-clinical help with day-to-day care." },
] as const;

export default function Home() {
  return (
    <>
      <Hero />

      <RevealScope>
        <section className="section" aria-labelledby="services-title">
          <div className="frame">
            <div className="section-header" data-reveal="">
              <h2 id="services-title">Four kinds of care</h2>
              <p>What each service is for, and where it stops.</p>
            </div>
            <div data-reveal-stagger="">
              <ServiceIndex items={categories} />
            </div>
          </div>
        </section>

        <section className="band" aria-labelledby="flow-title">
          <div className="frame band-grid">
            <div className="band-intro">
              <WordReveal as="h2" id="flow-title" text="You choose. The provider accepts." />
              <p data-reveal="">
                A request only becomes a booking when the provider says yes. Until then, nothing is confirmed.
              </p>
              <Link className="text-link" href="/how-it-works" data-reveal="">
                Read how it works
              </Link>
            </div>
            <StepTrack steps={requestSteps} />
          </div>
        </section>

        <section className="section" aria-labelledby="join-title">
          <div className="frame band-grid">
            <div className="band-intro" data-reveal="">
              <h2 id="join-title">Offer care on SureCure Visit</h2>
              <p className="text-[var(--ink-soft)]">
                Providers set their own prices and accept requests themselves. Each provider is checked before
                patients can book them.
              </p>
              <Link className="text-link" href="/providers">
                How joining works
              </Link>
            </div>
            <div data-reveal-stagger="">
              <ul className="service-index" aria-label="Create a provider account">
                {joinRoles.map((r) => (
                  <li className="service-item" key={r.role}>
                    <h3 className="service-name">
                      <Link className="service-link" href={`/sign-up?role=${r.role}`}>
                        {r.title}
                      </Link>
                    </h3>
                    <p className="service-summary">{r.summary}</p>
                    <svg className="service-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path
                        d="M4 12h15m-6-6 6 6-6 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </RevealScope>
    </>
  );
}
