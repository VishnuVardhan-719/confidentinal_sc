"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

/** Survives client-side navigations back to the home page; a full page load shows the welcome again. */
let seenThisPageLoad = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
const seen = () => seenThisPageLoad;
const seenOnServer = () => false;

/**
 * Welcome screen shown once per page load before the landing page: "Launching soon" with more new features on
 * the way. It is rendered with the page (crawlers and no-JS visitors still get the full landing page
 * underneath; a <noscript> rule hides it without scripts) and is dismissed with the button or Escape.
 */
export function LaunchSplash() {
  const t = useTranslations("common.launchSplash");
  const tc = useTranslations("common");
  const open = !useSyncExternalStore(subscribe, seen, seenOnServer);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) button.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  function enter() {
    seenThisPageLoad = true;
    listeners.forEach((listener) => listener());
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") enter();
    // One control: keep focus on it so keyboard users never tab into the page hidden behind.
    if (event.key === "Tab") {
      event.preventDefault();
      button.current?.focus();
    }
  }

  if (!open) return null;
  return (
    <>
      <noscript>
        <style>{"[data-launch-splash]{display:none!important}"}</style>
      </noscript>
      <div
        data-launch-splash
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-splash-title"
        aria-describedby="launch-splash-body"
        onKeyDown={onKeyDown}
        className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-forest-strong px-6 py-10 text-on-forest"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_50%_-10%,rgb(255_255_255/0.10),transparent_70%)]" />
        <div className="relative grid w-full max-w-3xl justify-items-center gap-8 text-center">
          <div className="inline-flex items-center gap-3 rounded-lg bg-paper px-4 py-3">
            <Image src="/brand/emblem.webp" alt="" aria-hidden="true" width={420} height={308} priority unoptimized className="h-11 w-auto sm:h-14" />
            <Image src="/brand/wordmark.png" alt={tc("brand")} width={640} height={101} priority unoptimized className="h-6 w-auto sm:h-8" />
          </div>
          <p
            id="launch-splash-title"
            className="scv-rise inline-flex items-center gap-3 rounded-full bg-paper px-6 py-3 font-display text-[clamp(2rem,1.2rem+4vw,4.25rem)] leading-none font-bold tracking-[-0.02em] text-forest-strong shadow-raised"
          >
            <span aria-hidden className="relative flex size-3.5 shrink-0">
              <span className="absolute inline-flex size-full rounded-full bg-danger opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-3.5 rounded-full bg-danger" />
            </span>
            {t("title")}
          </p>
          <p id="launch-splash-body" className="scv-rise scv-rise-delay max-w-xl font-display text-[clamp(1.25rem,1.05rem+1vw,1.75rem)] leading-snug text-on-forest">
            {t("body")}
          </p>
          <Button ref={button} type="button" variant="onForest" size="lg" onClick={enter}>
            {t("enter")}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      </div>
    </>
  );
}
