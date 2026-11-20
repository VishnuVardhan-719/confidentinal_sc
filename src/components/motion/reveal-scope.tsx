"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useMotionOk } from "./use-motion-ok";

type Revertible = { revert: () => unknown };

const EASE = "outExpo";
const MAX_STAGGER_MS = 360;

/**
 * Marketing-only scroll reveals, driven by Anime.js loaded on demand.
 *
 * Rules: content is visible in the server HTML and stays visible if JS fails or motion is off.
 * Only units that start below the fold are offset, then revealed once when they scroll in.
 * Everything is reverted on unmount or when motion becomes disallowed (e.g. reduced motion toggled on).
 *
 * Inside the scope:
 *  - [data-reveal]          fades and rises as one unit
 *  - [data-reveal-stagger]  its direct list items (li) rise in sequence
 *  - [data-reveal-words]    words lift out of their masks (see WordReveal)
 *  - [data-reveal-track]    the connector draws, then [data-reveal-step] items follow along it
 *
 * Never wrap forms, auth, booking or emergency content in this scope.
 */
export function RevealScope({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const ok = useMotionOk("reveal");

  useEffect(() => {
    const root = ref.current;
    if (!ok || !root || typeof IntersectionObserver === "undefined") return;

    let cancelled = false;
    const running: Revertible[] = [];
    let io: IntersectionObserver | undefined;

    (async () => {
      const [{ animate }, { set, stagger }, { createDrawable }] = await Promise.all([
        import("animejs/animation"),
        import("animejs/utils"),
        import("animejs/svg"),
      ]);
      if (cancelled) return;

      const belowFold = (el: Element) => el.getBoundingClientRect().top > window.innerHeight * 0.92;
      const step = (n: number) => Math.min(90, MAX_STAGGER_MS / Math.max(1, n));
      const plays = new Map<Element, () => void>();

      const unit = (el: HTMLElement) => {
        running.push(set(el, { opacity: 0, translateY: 18 }));
        plays.set(el, () => running.push(animate(el, { opacity: 1, translateY: 0, duration: 800, ease: EASE })));
      };

      const list = (el: HTMLElement) => {
        const items = Array.from(el.querySelectorAll<HTMLElement>("li"));
        if (!items.length) return;
        running.push(set(items, { opacity: 0, translateY: 22 }));
        plays.set(el, () =>
          running.push(
            animate(items, { opacity: 1, translateY: 0, duration: 800, delay: stagger(step(items.length)), ease: EASE }),
          ),
        );
      };

      const words = (el: HTMLElement) => {
        const ws = Array.from(el.querySelectorAll<HTMLElement>("[data-word]"));
        if (!ws.length) return;
        running.push(set(ws, { translateY: "105%" }));
        plays.set(el, () =>
          running.push(animate(ws, { translateY: "0%", duration: 900, delay: stagger(step(ws.length)), ease: EASE })),
        );
      };

      const track = (el: HTMLElement) => {
        const lines = createDrawable(el.querySelectorAll("[data-reveal-draw]"));
        const steps = Array.from(el.querySelectorAll<HTMLElement>("[data-reveal-step]"));
        running.push(set(lines, { draw: "0 0" }));
        running.push(set(steps, { opacity: 0, translateY: 14 }));
        plays.set(el, () => {
          running.push(animate(lines, { draw: ["0 0", "0 1"], duration: 1400, ease: "inOutQuad" }));
          running.push(
            animate(steps, { opacity: 1, translateY: 0, duration: 700, delay: stagger(320, { start: 180 }), ease: EASE }),
          );
        });
      };

      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => belowFold(el) && unit(el));
      root.querySelectorAll<HTMLElement>("[data-reveal-stagger]").forEach((el) => belowFold(el) && list(el));
      root.querySelectorAll<HTMLElement>("[data-reveal-words]").forEach((el) => belowFold(el) && words(el));
      root.querySelectorAll<HTMLElement>("[data-reveal-track]").forEach((el) => belowFold(el) && track(el));

      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            plays.get(e.target)?.();
            plays.delete(e.target);
            io?.unobserve(e.target);
          }
        },
        { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
      );
      plays.forEach((_, el) => io?.observe(el));
    })();

    return () => {
      cancelled = true;
      io?.disconnect();
      // Revert newest first so every element ends at its original, visible state.
      for (let i = running.length - 1; i >= 0; i--) running[i].revert();
    };
  }, [ok]);

  return <div ref={ref}>{children}</div>;
}
