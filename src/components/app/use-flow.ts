"use client";

import { useEffect, useRef, useState } from "react";
import { canOpenStep } from "./steps";

/**
 * Step state for a multi-step form. Moving to a step focuses its heading so keyboard and screen reader
 * users land at the start of the new step (and hear its title). The first render does not move focus.
 */
export function useFlow(count: number, initialStep = 0) {
  const [step, setStep] = useState(initialStep);
  const [furthest, setFurthest] = useState(initialStep);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    headingRef.current?.focus();
  }, [step]);

  function open(index: number) {
    if (!canOpenStep(index, furthest, count)) return;
    moved.current = true;
    setStep(index);
  }

  function advance() {
    const next = Math.min(step + 1, count - 1);
    moved.current = true;
    setStep(next);
    setFurthest((f) => Math.max(f, next));
  }

  function back() {
    open(Math.max(step - 1, 0));
  }

  /** Back to step 1 with nothing reached, e.g. after a demo request is sent. */
  function reset() {
    moved.current = true;
    setStep(0);
    setFurthest(0);
  }

  return { step, furthest, open, advance, back, reset, headingRef };
}

/**
 * Moves focus to the first field named in `errors`, in form order. Looks fields up by name because the
 * error attributes (aria-invalid) are not in the DOM until React re-renders.
 */
export function focusFirstError(form: HTMLFormElement, errors: Record<string, string>) {
  const names = new Set(Object.keys(errors));
  for (const el of Array.from(form.elements)) {
    const name = (el as HTMLInputElement).name;
    if (name && names.has(name) && el instanceof HTMLElement) {
      el.focus();
      return;
    }
  }
}
