import { Plus } from "lucide-react";

/** Native disclosure: keyboard and screen-reader accessible, works without JavaScript. */
export function FaqItem({ id, question, answer, headingLevel = "h3" }: { id: string; question: string; answer: string; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <details id={`faq-${id}`} className="group border-b border-border">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left [&::-webkit-details-marker]:hidden">
        <Heading className="text-lg font-semibold text-ink group-open:text-forest">{question}</Heading>
        <Plus
          aria-hidden
          className="size-5 shrink-0 text-forest transition-transform duration-(--scv-duration) ease-out group-open:rotate-45"
        />
      </summary>
      <p className="measure pb-5 text-base text-muted">{answer}</p>
    </details>
  );
}
