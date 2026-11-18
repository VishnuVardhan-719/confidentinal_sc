import { Plus } from "lucide-react";
import type { RichTextDoc } from "./content-source";
import { RichText } from "./rich-text";

/** Native disclosure: keyboard and screen-reader accessible, works without JavaScript. */
export function FaqItem({
  id,
  question,
  answer,
  answerDoc,
  headingLevel = "h3",
}: {
  id: string;
  question: string;
  answer: string;
  answerDoc?: RichTextDoc;
  headingLevel?: "h2" | "h3";
}) {
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
      {answerDoc ? (
        <RichText doc={answerDoc} className="pb-5 [&_li]:text-base [&_li]:text-muted [&_p]:text-base [&_p]:text-muted" />
      ) : (
        <p className="measure pb-5 text-base text-muted">{answer}</p>
      )}
    </details>
  );
}
