import type { ReactNode } from "react";

export type FaqItem = { id: string; question: string; answer: ReactNode };

/**
 * Accordion built on native <details>/<summary>: keyboard operable (Enter/Space), announced as
 * expandable by screen readers, works without JavaScript, and browser find-in-page opens matches.
 */
export function FaqAccordion({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="mk-faq-list">
      {items.map((item) => (
        <details className="mk-faq" id={item.id} key={item.id}>
          <summary>
            <span>{item.question}</span>
            <svg className="mk-faq-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path
                className="mk-faq-v"
                d="M12 5v14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </summary>
          <div className="mk-faq-answer">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}
