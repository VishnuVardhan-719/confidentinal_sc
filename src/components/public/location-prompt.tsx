"use client";

import { CircleAlert, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { fieldControlClass } from "@/components/ui/input";
import { usePathname } from "@/i18n/navigation";
import { LOCALITIES } from "./localities";
import { readSavedLocation, saveLocation, skipLocation } from "./saved-location";

/** Pages that must never be covered by a prompt. */
const QUIET_PREFIXES = ["/emergency"];

/**
 * First-visit question: "Where do you need care?". Asks for a locality or PIN code (typed, never GPS),
 * keeps the answer only in this browser, and asks once: closing it or "Not now" is remembered too.
 * The finder and directories start from the saved area.
 */
export function LocationPrompt() {
  const t = useTranslations("common.locationPrompt");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const quiet = QUIET_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (quiet || readSavedLocation()) return;
    // A beat after load, so the page paints first and the question does not fight the first render.
    // While the "Launching soon" welcome screen is up the question waits for it to be dismissed.
    let timer = 0;
    const attempt = () => {
      if (readSavedLocation()) return;
      if (document.querySelector("[data-launch-splash]")) {
        timer = window.setTimeout(attempt, 400);
        return;
      }
      setOpen(true);
    };
    timer = window.setTimeout(attempt, 600);
    return () => window.clearTimeout(timer);
  }, [quiet]);

  function dismiss() {
    skipLocation();
    setOpen(false);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!saveLocation(value)) {
      setError(true);
      document.getElementById("location-prompt-input")?.focus();
      return;
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <DialogContent data-testid="location-prompt" aria-describedby="location-prompt-body">
        <span aria-hidden className="inline-flex size-11 items-center justify-center rounded-full bg-mist text-forest">
          <MapPin className="size-6" />
        </span>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription id="location-prompt-body">{t("body")}</DialogDescription>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="location-prompt-input" className="text-base font-semibold text-ink">
              {t("label")}
            </label>
            {error ? (
              <p id="location-prompt-error" className="flex items-start gap-1.5 text-sm font-medium text-danger">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t("error")}
              </p>
            ) : null}
            <input
              id="location-prompt-input"
              name="location"
              type="text"
              autoComplete="off"
              autoCapitalize="words"
              maxLength={60}
              list="location-prompt-options"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(false);
              }}
              placeholder={t("hint")}
              aria-describedby={error ? "location-prompt-error" : undefined}
              aria-invalid={error || undefined}
              className={fieldControlClass}
            />
            <datalist id="location-prompt-options">
              {LOCALITIES.map((l) => (
                <option key={l.name} value={l.name} />
              ))}
            </datalist>
          </div>
          <DialogFooter>
            <Button type="button" variant="quiet" onClick={dismiss}>
              {t("skip")}
            </Button>
            <Button type="submit">{t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
