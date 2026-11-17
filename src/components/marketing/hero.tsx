import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/button-link";
import { getDemoSession } from "@/lib/demo/auth";
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
          <Suspense fallback={<HeroActions />}>
            <SessionHeroActions />
          </Suspense>
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

/**
 * Hero calls to action. Guests get "Find care" + "Create account" and a sign-in link; a demo session
 * swaps the secondary action for the person's own dashboard. Same shape either way, so no layout shift.
 */
function HeroActions({ home, name }: { home?: string; name?: string }) {
  return (
    <div className={styles.ctas}>
      <div className="actions">
        <ButtonLink href="/categories">Find care</ButtonLink>
        {home ? (
          <ButtonLink href={home} variant="secondary">
            Go to your dashboard
          </ButtonLink>
        ) : (
          <ButtonLink href="/sign-up" variant="secondary">
            Create account
          </ButtonLink>
        )}
      </div>
      <p className={styles.signin}>
        {name ? (
          <>Signed in as {name} (demo).</>
        ) : (
          <>
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}

/** Reads the demo cookie, so it streams inside Suspense; the guest version is the prerendered fallback. */
async function SessionHeroActions() {
  const session = await getDemoSession();
  return session ? <HeroActions home={session.home} name={session.name} /> : <HeroActions />;
}