import type { JSX } from "react";
import styles from "./motion.module.css";

type Tag = "h1" | "h2" | "h3" | "p";

/**
 * Editorial word-mask reveal (re-implemented from scratch, no third-party code).
 * Server-rendered: each word sits in a clipping mask so RevealScope can lift it into place.
 * Assistive tech reads one plain copy of the text; the animated words are hidden from it.
 */
export function WordReveal({ as: Tag = "h2", text, id, className }: { as?: Tag; text: string; id?: string; className?: string }): JSX.Element {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <Tag id={id} className={className} data-reveal-words="">
      <span className="visually-hidden">{text}</span>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true">
          <span className={styles.mask}>
            <span className={styles.word} data-word="">
              {w}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}
