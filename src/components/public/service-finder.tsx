"use client";

import { ArrowRight, CircleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fieldControlClass } from "@/components/ui/input";
import { ServiceIcon } from "@/components/shared/service-icon";
import { useOnHydrated } from "@/components/shared/use-early-input";
import { useRouter } from "@/i18n/navigation";
import { validateFinder, type FinderErrors } from "./finder";
import { LOCALITIES } from "./localities";
import { LOCATION_EVENT, readSavedLocation } from "./saved-location";
import { SERVICES, type ServiceKey } from "./routes";

const noopSubscribe = () => () => {};

/** Whole-form problems: no connection when submitting, or a finder link (/find) that could not be used. */
export type FinderFormError = "offline" | "invalidLink";

/** Query flag /{locale}/find sets when it sends someone back with input it could not use. */
export const FINDER_INVALID_FLAG = "finder";

export type FinderLabels = {
  pinLabel: string;
  pinHint: string;
  serviceLegend: string;
  submit: string;
  submitting: string;
  noSignIn: string;
  errors: Record<"pinRequired" | "pinInvalid" | "serviceRequired" | FinderFormError, string>;
};

/**
 * Locality-or-PIN + service finder. Works without JS as a GET form to /{locale}/find (native required
 * validation, the server resolves a locality to its PIN). With JS it validates inline and navigates to
 * /{service}?pin=. Starts from the location the visitor gave in the first-visit prompt. No geolocation.
 */
export function ServiceFinder({ labels, idPrefix = "finder" }: { labels: FinderLabels; idPrefix?: string }) {
  const tc = useTranslations("common.services");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pin, setPin] = useState("");
  const [service, setService] = useState<ServiceKey | "">("");
  const [errors, setErrors] = useState<FinderErrors>({});
  const [formError, setFormError] = useState<FinderFormError | null>(null);

  // A PIN typed or a service chosen while JS was still loading is in the DOM, not in state: adopt
  // it at hydration so React does not clear it (REQUESTS R-FE-D-41).
  const formRef = useRef<HTMLFormElement>(null);
  const touched = useRef(false);
  useOnHydrated(() => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    const earlyPin = String(fd.get("pin") ?? "").trim().slice(0, 60);
    const earlyService = SERVICES.find((s) => s.key === fd.get("service"))?.key;
    if (earlyPin) {
      setPin(earlyPin);
      touched.current = true;
    }
    if (earlyService) setService(earlyService);
    // Sent back by /find with input it could not use: say so once, then drop the flag from the URL.
    const url = new URL(window.location.href);
    if (url.searchParams.get(FINDER_INVALID_FLAG) === "invalid") {
      setFormError("invalidLink");
      url.searchParams.delete(FINDER_INVALID_FLAG);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  });

  // Start from the location the visitor already gave (first-visit prompt), unless they have typed.
  useEffect(() => {
    const adopt = () => {
      const saved = readSavedLocation();
      if (saved && "label" in saved && !touched.current) setPin(saved.label);
    };
    adopt();
    window.addEventListener(LOCATION_EVENT, adopt);
    return () => window.removeEventListener(LOCATION_EVENT, adopt);
  }, []);

  // Progressive enhancement: native validation on the server render, inline messages once hydrated.
  const enhanced = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const pinId = `${idPrefix}-pin`;
  const pinHintId = `${pinId}-hint`;
  const pinErrorId = `${pinId}-error`;
  const serviceErrorId = `${idPrefix}-service-error`;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = validateFinder({ pin, service });
    if (!result.ok) {
      setErrors(result.errors);
      const first = result.errors.pin ? pinId : `${idPrefix}-service-${SERVICES[0].key}`;
      document.getElementById(first)?.focus();
      return;
    }
    setErrors({});
    // Offline: keep everything as typed and say why, instead of a failed navigation to a browser error page.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFormError("offline");
      return;
    }
    setFormError(null);
    startTransition(() => router.push(result.href));
  }

  return (
    <form
      ref={formRef}
      action={`/${locale}/find`}
      method="get"
      noValidate={enhanced}
      onSubmit={onSubmit}
      className="grid gap-6"
      aria-describedby={`${idPrefix}-nosignin`}
    >
      <div className="grid gap-2">
        <label htmlFor={pinId} className="text-base font-semibold text-ink">
          {labels.pinLabel}
        </label>
        <p id={pinHintId} className="-mt-1 text-sm text-muted">
          {labels.pinHint}
        </p>
        {errors.pin ? (
          <p id={pinErrorId} className="flex items-start gap-1.5 text-sm font-medium text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {labels.errors[errors.pin]}
          </p>
        ) : null}
        <input
          id={pinId}
          name="pin"
          type="text"
          autoComplete="off"
          autoCapitalize="words"
          maxLength={60}
          required
          list={`${pinId}-options`}
          value={pin}
          onChange={(e) => {
            touched.current = true;
            setPin(e.target.value);
            if (errors.pin) setErrors((x) => ({ ...x, pin: undefined }));
          }}
          aria-describedby={errors.pin ? `${pinErrorId} ${pinHintId}` : pinHintId}
          aria-invalid={errors.pin ? true : undefined}
          className={cn(fieldControlClass, "max-w-md")}
        />
        <datalist id={`${pinId}-options`}>
          {LOCALITIES.map((l) => (
            <option key={l.name} value={l.name} />
          ))}
        </datalist>
      </div>

      <fieldset className="grid gap-3" aria-describedby={errors.service ? serviceErrorId : undefined}>
        <legend className="mb-3 text-base font-semibold text-ink">{labels.serviceLegend}</legend>
        {errors.service ? (
          <p id={serviceErrorId} className="-mt-1 flex items-start gap-1.5 text-sm font-medium text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {labels.errors.serviceRequired}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SERVICES.map((s) => {
            const id = `${idPrefix}-service-${s.key}`;
            return (
              <label
                key={s.key}
                htmlFor={id}
                className={cn(
                  "group relative flex min-h-16 cursor-pointer items-center gap-3 rounded-md border border-border-strong bg-surface px-4 py-3",
                  "transition-[border-color,background-color,box-shadow] duration-(--scv-duration-fast) hover:border-forest",
                  "has-[:checked]:border-forest has-[:checked]:bg-mist has-[:checked]:shadow-[inset_0_0_0_1px_var(--scv-forest)]",
                  "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  errors.service && "border-danger",
                )}
              >
                <input
                  id={id}
                  type="radio"
                  name="service"
                  value={s.key}
                  required
                  checked={service === s.key}
                  onChange={() => {
                    setService(s.key);
                    if (errors.service) setErrors((x) => ({ ...x, service: undefined }));
                  }}
                  className="peer sr-only"
                />
                <ServiceIcon name={s.icon} className="size-6 shrink-0 text-forest" />
                <span className="grid">
                  <span className="font-semibold text-ink">{tc(`${s.key}.label`)}</span>
                  <span className="text-sm text-muted">{tc(`${s.key}.short`)}</span>
                </span>
                <span
                  aria-hidden
                  className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong peer-checked:border-forest peer-checked:after:size-2.5 peer-checked:after:rounded-full peer-checked:after:bg-forest peer-checked:after:content-['']"
                />
              </label>
            );
          })}
        </div>
      </fieldset>

      {formError ? (
        <p id={`${idPrefix}-form-error`} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {labels.errors[formError]}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? labels.submitting : labels.submit}
          <ArrowRight aria-hidden />
        </Button>
        <p id={`${idPrefix}-nosignin`} className="text-sm text-muted">
          {labels.noSignIn}
        </p>
      </div>
      <p aria-live="polite" className="sr-only">
        {pending ? labels.submitting : ""}
      </p>
    </form>
  );
}
