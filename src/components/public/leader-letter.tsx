import Image from "next/image";
import { useTranslations } from "next-intl";
import type { Leader } from "./leadership";

/**
 * One leader's letter: portrait, name and role, the headline and pull quote, the letter, the short list
 * of values and the sign-off. The words are the leader's own and stay in English (lang="en").
 */
export function LeaderLetter({ leader }: { leader: Leader }) {
  const t = useTranslations("public.ourStory");
  const headingId = `leader-${leader.id}`;
  return (
    <section aria-labelledby={headingId} className="grid gap-8 border-t border-border pt-10 lg:grid-cols-12 lg:gap-12">
      <div className="grid content-start gap-4 lg:col-span-4">
        <div className="lg:sticky lg:top-24">
          <Image
            src={leader.photo}
            alt={t("portraitAlt", { name: leader.name })}
            width={leader.photoWidth}
            height={leader.photoHeight}
            unoptimized
            className="aspect-[4/5] w-full max-w-sm rounded-lg border border-border bg-mist object-cover object-top"
          />
          <p className="mt-4 font-display text-2xl leading-tight font-medium text-ink" lang="en">
            {leader.name}
          </p>
          <p className="mt-1 font-semibold text-forest" lang="en">
            {leader.role}
          </p>
        </div>
      </div>

      <div className="grid content-start gap-7 lg:col-span-8" lang="en">
        <h2 id={headingId} className="measure font-display text-[clamp(1.6rem,1.3rem+1.2vw,2.25rem)] leading-[1.15] font-medium tracking-[-0.02em] text-ink">
          {leader.heading}
        </h2>
        <blockquote className="measure border-l-4 border-teal pl-5 font-display text-xl leading-snug text-ink">
          <p>“{leader.quote}”</p>
        </blockquote>
        <div className="measure grid gap-4 text-lg leading-relaxed text-ink">
          {leader.letter.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {leader.list && leader.listTitle ? (
          <div className="measure grid gap-3 rounded-lg bg-paper-deep p-5 sm:p-6">
            <h3 className="font-display text-xl font-medium text-ink">{leader.listTitle}</h3>
            <ul className="grid gap-3">
              {leader.list.map((item) => (
                <li key={item.title} className="grid gap-0.5 border-l-2 border-forest/40 pl-4">
                  <span className="font-semibold text-ink">{item.title}</span>
                  {item.body ? <span className="text-base text-muted">{item.body}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="measure grid gap-4 text-lg leading-relaxed text-ink">
          {leader.closing.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <p className="text-base text-muted">
          {leader.signoff},<br />
          <span className="font-semibold text-ink">
            {leader.name}, {leader.role}
          </span>
        </p>
      </div>
    </section>
  );
}
