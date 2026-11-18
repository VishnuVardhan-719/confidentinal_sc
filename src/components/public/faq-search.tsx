"use client";

import { Search, X } from "lucide-react";
import { useDeferredValue, useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fieldControlClass } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { filterFaq, type FaqCategory, type FaqEntry } from "./faq";
import { FaqItem } from "./faq-item";

export type FaqSearchLabels = {
  searchLabel: string;
  searchHint: string;
  /** Pre-rendered count strings are not possible for every number, so the caller passes a formatter key map. */
  results: Record<"zero" | "one" | "other", string>;
  noResultsTitle: string;
  noResultsBody: string;
  clear: string;
  categories: Record<FaqCategory, string>;
};

const noopSubscribe = () => () => {};

/**
 * Searchable FAQ. Without JavaScript the full list renders and the search box is hidden, so there is
 * never a control that does nothing.
 */
export function FaqSearch({ entries, labels }: { entries: FaqEntry[]; labels: FaqSearchLabels }) {
  const enhanced = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const id = useId();
  const visible = filterFaq(entries, deferred);
  const categories = Object.keys(labels.categories) as FaqCategory[];
  const count = visible.length;
  const countText = (count === 0 ? labels.results.zero : count === 1 ? labels.results.one : labels.results.other).replace(
    "#",
    String(count),
  );

  return (
    <div className="grid gap-10">
      <div className={cn("grid max-w-xl gap-2", !enhanced && "hidden")} role="search">
        <label htmlFor={`${id}-q`} className="text-base font-semibold text-ink">
          {labels.searchLabel}
        </label>
        <p id={`${id}-hint`} className="-mt-1 text-sm text-muted">
          {labels.searchHint}
        </p>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
          <input
            id={`${id}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-describedby={`${id}-hint ${id}-count`}
            aria-controls={`${id}-results`}
            className={cn(fieldControlClass, "pl-11 [&::-webkit-search-cancel-button]:hidden")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-0 inline-flex size-target -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-ink"
              aria-label={labels.clear}
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>
        <p id={`${id}-count`} aria-live="polite" className="text-sm text-muted">
          {deferred ? countText : ""}
        </p>
      </div>

      <div id={`${id}-results`} className="grid gap-12">
        {count === 0 ? (
          <EmptyState
            icon="search"
            title={labels.noResultsTitle}
            description={labels.noResultsBody}
            action={
              <Button variant="secondary" onClick={() => setQuery("")}>
                {labels.clear}
              </Button>
            }
          />
        ) : (
          categories.map((cat) => {
            const items = visible.filter((e) => e.category === cat);
            if (items.length === 0) return null;
            return (
              <section key={cat} aria-labelledby={`${id}-${cat}`} className="grid gap-2 md:grid-cols-[14rem_1fr] md:gap-10">
                <h2 id={`${id}-${cat}`} className="font-display text-xl font-medium text-ink md:pt-4">
                  {labels.categories[cat]}
                </h2>
                <div className="border-t border-border">
                  {items.map((e) => (
                    <FaqItem key={e.id} id={e.id} question={e.q} answer={e.a} answerDoc={e.answerDoc} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
