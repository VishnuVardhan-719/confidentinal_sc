import { ButtonLink } from "@/components/button-link";
import { HeroPoster } from "./hero-poster";
import { HeroVisual } from "./hero-visual";
import styles from "./hero.module.css";

/**
 * Home hero. Copy and the status panel are server-rendered and never animated
 * (the status panel carries emergency guidance). The visual is decorative.
 */
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="frame hero-grid">
        <div className="hero-copy">
          <h1 id="hero-title">
            Care you <em>choose</em>, arranged with clarity.
          </h1>
          <p className="lead">
            Doctor visits, lab services, scheduled ambulance transport and non-clinical caretaker support. You pick the
            provider, and the provider accepts your request.
          </p>
          <div className="actions">
            <ButtonLink href="/categories">Explore services</ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary">
              How it works
            </ButtonLink>
          </div>
        </div>

        <div className={styles.side}>
          <HeroVisual>
            <HeroPoster />
          </HeroVisual>
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
      </div>
    </section>
  );
}
