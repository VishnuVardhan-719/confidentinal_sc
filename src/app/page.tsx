import Link from "next/link";
import { Hero } from "@/components/marketing/hero";
import { RevealScope } from "@/components/motion/reveal-scope";
import { StepTrack } from "@/components/motion/step-track";
import { WordReveal } from "@/components/motion/word-reveal";
import { ServiceIndex } from "@/components/service-index";
import { categories } from "./categories/data";
import { requestSteps } from "./how-it-works/steps";

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
      </RevealScope>
    </>
  );
}
