"use client";

import { Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { ApiResult } from "@/lib/api/result";
import { cn } from "@/components/ui/cn";
import { fieldControlClass } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import {
  flattenSuggestions,
  isInternalSuggestionHref,
  moveActive,
  normalizeQuery,
  type Suggestion,
  type SuggestionGroup,
} from "./search-combobox-logic";

export type { Suggestion, SuggestionGroup } from "./search-combobox-logic";
export type SuggestResult = ApiResult<SuggestionGroup[]>;

export type SearchComboboxLabels = {
  label: string;
  hint?: string;
  placeholder?: string;
  loading: string;
  /** "No suggestions for this search" style message. */
  empty: string;
  error: string;
  /** Shown when suggestions are gated (no backend yet). Search still works on Enter. */
  unavailable: string;
  /** Live-region text with "#" for the number of suggestions. */
  count: string;
};

type Phase = "idle" | "loading" | "ready" | "error" | "unavailable";

const noopSubscribe = () => () => {};

/**
 * Accessible search box with grouped type-ahead suggestions (ARIA 1.2 combobox + listbox).
 * - Debounced, cancels stale requests (AbortController) and ignores out-of-order responses.
 * - Keyboard: ArrowDown/ArrowUp move, Enter chooses the active option (or submits the form),
 *   Escape closes, a second Escape clears. Mouse/touch selection keeps focus in the input.
 * - Without `loadSuggestions`, or without JS, it is a plain named search input inside the form.
 * - Choosing a suggestion with `href` navigates (internal paths only); otherwise it fills the input.
 * Never send health details to analytics from here; queries go only to `loadSuggestions`.
 */
export function SearchCombobox({
  name = "q",
  labels,
  defaultValue = "",
  minChars = 2,
  debounceMs = 250,
  loadSuggestions,
  onSelect,
  className,
  inputClassName,
}: {
  name?: string;
  labels: SearchComboboxLabels;
  defaultValue?: string;
  minChars?: number;
  debounceMs?: number;
  loadSuggestions?: (query: string, signal: AbortSignal) => Promise<SuggestResult>;
  onSelect?: (suggestion: Suggestion) => void;
  className?: string;
  inputClassName?: string;
}) {
  const id = useId();
  const router = useRouter();
  // Combobox semantics only once hydrated; the server/no-JS render is a plain search input.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const suggest = hydrated ? loadSuggestions : undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [groups, setGroups] = useState<SuggestionGroup[]>([]);
  const [active, setActive] = useState(-1);
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options = flattenSuggestions(groups);
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const expanded = open && phase !== "idle";

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const request = useCallback(
    (raw: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      const q = normalizeQuery(raw, minChars);
      if (!loadSuggestions || !q) {
        setPhase("idle");
        setGroups([]);
        setActive(-1);
        return;
      }
      // New query: drop the previous results so Enter can never choose a stale option.
      setGroups([]);
      setActive(-1);
      setPhase("loading");
      timerRef.current = setTimeout(async () => {
        const seq = ++requestSeq.current;
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const result = await loadSuggestions(q, controller.signal);
          if (seq !== requestSeq.current || controller.signal.aborted) return;
          if (result.ok) {
            const nonEmpty = result.data.filter((g) => g.items.length > 0);
            setGroups(nonEmpty);
            setPhase("ready");
          } else {
            setGroups([]);
            setPhase(result.error.code === "gated" ? "unavailable" : "error");
          }
          setActive(-1);
        } catch {
          if (seq !== requestSeq.current || controller.signal.aborted) return;
          setGroups([]);
          setPhase("error");
        }
      }, debounceMs);
    },
    [debounceMs, loadSuggestions, minChars],
  );

  function choose(s: Suggestion) {
    setValue(s.value ?? s.label);
    setOpen(false);
    setActive(-1);
    if (onSelect) onSelect(s);
    else if (isInternalSuggestionHref(s.href)) router.push(s.href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!loadSuggestions) return;
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => moveActive(a, e.key === "ArrowDown" ? 1 : -1, options.length));
    } else if (e.key === "Enter") {
      if (expanded && active >= 0 && options[active]) {
        e.preventDefault();
        choose(options[active]);
      }
      // otherwise let the form submit
    } else if (e.key === "Escape") {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (value) {
        e.preventDefault();
        setValue("");
        request("");
      }
    }
  }

  const status =
    phase === "loading"
      ? labels.loading
      : phase === "error"
        ? labels.error
        : phase === "unavailable"
          ? labels.unavailable
          : phase === "ready"
            ? options.length === 0
              ? labels.empty
              : labels.count.replace("#", String(options.length))
            : "";

  const offsets = groups.reduce<number[]>((acc, g, gi) => [...acc, gi === 0 ? 0 : acc[gi - 1] + groups[gi - 1].items.length], []);
  return (
    <div className={cn("relative grid gap-2", className)}>
      <label htmlFor={`${id}-input`} className="text-base font-semibold text-ink">
        {labels.label}
      </label>
      {labels.hint ? (
        <p id={hintId} className="-mt-1 text-sm text-muted">
          {labels.hint}
        </p>
      ) : null}
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          name={name}
          type="search"
          role={suggest ? "combobox" : undefined}
          aria-autocomplete={suggest ? "list" : undefined}
          aria-expanded={suggest ? expanded : undefined}
          aria-controls={suggest ? listId : undefined}
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          aria-describedby={labels.hint ? hintId : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={labels.placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            request(e.target.value);
          }}
          onFocus={() => phase !== "idle" && setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={cn(fieldControlClass, "pr-10 pl-11 [&::-webkit-search-cancel-button]:hidden", inputClassName)}
        />
        {phase === "loading" ? (
          <Loader2 aria-hidden className="absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-muted motion-safe:animate-spin" />
        ) : null}
      </div>

      {suggest ? (
        <div
          className={cn(
            "absolute top-full right-0 left-0 z-40 mt-1 max-h-[min(24rem,60vh)] overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-overlay",
            !expanded && "hidden",
          )}
        >
          <ul id={listId} role="listbox" aria-label={labels.label} className="grid">
            {groups.map((g, gi) => (
              <li key={g.id} role="presentation">
                <ul role="group" aria-labelledby={`${id}-g-${g.id}`} className="grid">
                  <li role="presentation" id={`${id}-g-${g.id}`} className="px-3 pt-2 pb-1 text-sm font-semibold text-muted">
                    {g.label}
                  </li>
                  {g.items.map((s, si) => {
                    const i = offsets[gi] + si;
                    return (
                      <li
                        key={s.id}
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(s)}
                        onMouseEnter={() => setActive(i)}
                        className={cn(
                          "grid min-h-target cursor-pointer content-center rounded-sm px-3 py-2",
                          i === active ? "bg-mist text-forest" : "text-ink",
                        )}
                      >
                        <span className="font-medium">{s.label}</span>
                        {s.description ? <span className="text-sm text-muted">{s.description}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
          {phase !== "ready" || options.length === 0 ? <p className="px-3 py-2 text-sm text-muted">{status}</p> : null}
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {open ? status : ""}
      </p>
    </div>
  );
}
