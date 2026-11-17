import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { ServiceIndex } from "@/components/service-index";
import { categories } from "./categories/data";
import { requestSteps } from "./how-it-works/steps";

export default function Home() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1 id="hero-title">
              Care you <em>choose</em>, arranged with clarity.
            </h1>
            <p className="lead">
              Doctor visits, lab services, scheduled ambulance transport and non-clinical caretaker support. You pick
              the provider, and the provider accepts your request.
            </p>
            <div className="actions">
              <ButtonLink href="/categories">Explore services</ButtonLink>
              <ButtonLink href="/how-it-works" variant="secondary">
                How it works
              </ButtonLink>
            </div>
          </div>

          <aside className="status" aria-labelledby="status-title">
            <h2 id="status-title" className="status-title">
              Where things stand today
            </h2>
            <dl>
              <div>
                <dt>Online booking</dt>
                <dd>Not open yet. This site explains the service before it launches.</dd>
              </div>
              <div>
                <dt>In an emergency</dt>
                <dd>
                  Call <a href="tel:112">112</a> in India. SureCure Visit is not an emergency service.
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="section" aria-labelledby="services-title">
        <div className="container">
          <div className="section-header">
            <h2 id="services-title">Four kinds of care</h2>
            <p>What each service is for, and where it stops.</p>
          </div>
          <ServiceIndex items={categories} />
        </div>
      </section>

      <section className="band" aria-labelledby="flow-title">
        <div className="container band-grid">
          <div className="band-intro">
            <h2 id="flow-title">You choose. The provider accepts.</h2>
            <p>A request only becomes a booking when the provider says yes. Until then, nothing is confirmed.</p>
            <Link className="text-link" href="/how-it-works">
              Read how it works
            </Link>
          </div>
          <ol className="track">
            {requestSteps.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
