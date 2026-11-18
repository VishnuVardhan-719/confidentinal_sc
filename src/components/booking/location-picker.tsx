"use client";

import { Crosshair, Loader2, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Field } from "@/components/shared/field";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCoordinates, searchOriginSchema, type SearchOrigin } from "@/modules/providers/doctor-search";

export type ConfirmedLocation =
  | { kind: "device"; origin: SearchOrigin }
  | { kind: "manual"; city: string; pin: string; line?: string };
type Device = { status: "idle" | "requesting" | "denied" | "unavailable" | "timeout" | "unsupported" } | { status: "located"; origin: SearchOrigin };
export type GeolocationLike = Pick<Geolocation, "getCurrentPosition">;

const LOW_ACCURACY_M = 1000;
const PIN_RE = /^[1-9][0-9]{5}$/;
const CITY_RE = /^\p{L}[\p{L} .'-]{1,59}$/u;

/**
 * Explicit-consent location capture. Nothing is requested until the user presses the button, nothing is
 * written to storage, cookies or the URL, and the parent receives a location only on "Use this location".
 * Map pin adjustment is gated until an approved map provider exists (REQUESTS.md).
 */
export function LocationPicker({ purpose, onConfirm, onDiscard, defaultCity = "", defaultPin = "", geolocation, idPrefix = "location" }: {
  purpose: "search" | "booking";
  onConfirm: (location: ConfirmedLocation) => void;
  onDiscard?: () => void;
  defaultCity?: string;
  defaultPin?: string;
  /** Injected for tests; defaults to navigator.geolocation when available. */
  geolocation?: GeolocationLike | null;
  idPrefix?: string;
}) {
  const t = useTranslations("booking.location");
  const uid = useId();
  const id = (name: string) => `${idPrefix}-${uid}-${name}`;
  const [device, setDevice] = useState<Device>({ status: "idle" });
  const [city, setCity] = useState(defaultCity);
  const [pin, setPin] = useState(defaultPin);
  const [line, setLine] = useState("");
  const [errors, setErrors] = useState<{ city?: string; pin?: string }>({});
  const request = useRef(0);

  function locate() {
    const geo = geolocation === undefined ? (typeof navigator !== "undefined" && "geolocation" in navigator ? navigator.geolocation : null) : geolocation;
    if (!geo || (typeof window !== "undefined" && window.isSecureContext === false)) { setDevice({ status: "unsupported" }); return; }
    const current = ++request.current;
    setDevice({ status: "requesting" });
    geo.getCurrentPosition(
      position => {
        if (current !== request.current) return;
        const origin = searchOriginSchema.safeParse({ lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: position.coords.accuracy });
        setDevice(origin.success ? { status: "located", origin: origin.data } : { status: "unavailable" });
      },
      error => {
        if (current !== request.current) return;
        setDevice({ status: error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable" });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }
  function confirmManual() {
    const next = { city: CITY_RE.test(city.trim()) ? undefined : t("cityInvalid"), pin: PIN_RE.test(pin.trim()) ? undefined : t("pinInvalid") };
    setErrors(next);
    if (next.city || next.pin) {
      document.getElementById(next.city ? id("city") : id("pin"))?.focus();
      return;
    }
    const trimmed = line.trim().slice(0, 120);
    onConfirm({ kind: "manual", city: city.trim(), pin: pin.trim(), ...(purpose === "booking" && trimmed ? { line: trimmed } : {}) });
  }
  function discard() {
    request.current++;
    setDevice({ status: "idle" }); setCity(""); setPin(""); setLine(""); setErrors({});
    onDiscard?.();
  }
  const located = device.status === "located" ? formatCoordinates(device.origin) : null;
  const failure = ["denied", "unavailable", "timeout", "unsupported"].includes(device.status) ? device.status as "denied" | "unavailable" | "timeout" | "unsupported" : null;

  return (
    <div className="grid gap-6">
      <section aria-labelledby={id("device-title")} className="grid gap-3">
        <h3 id={id("device-title")} className="text-lg font-semibold text-ink">{t("title")}</h3>
        <p className="text-base text-muted">{t("consent")}</p>
        <div>
          <Button type="button" variant="secondary" onClick={locate} disabled={device.status === "requesting"} aria-describedby={id("device-status")}>
            {device.status === "requesting" ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : <Crosshair aria-hidden />}
            {t("useCurrent")}
          </Button>
        </div>
        <div id={id("device-status")} aria-live="polite" className="grid gap-3">
          {device.status === "requesting" ? <p className="text-base text-muted">{t("requesting")}</p> : null}
          {failure ? <Notice tone="warning" action={failure === "unsupported" ? undefined : <Button type="button" variant="quiet" onClick={locate}>{t("retry")}</Button>}>{t(failure)}</Notice> : null}
          {located && device.status === "located" ? (
            <div className="grid gap-3 rounded-md border border-border bg-mist/60 p-4">
              <p className="flex items-start gap-2 text-base text-ink">
                <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-forest" />
                <span><span className="font-semibold">{t("pinned")}: </span><span className="tabular">{t("result", { coordinates: located.coordinates, accuracy: located.accuracyM })}</span></span>
              </p>
              {device.origin.accuracyM > LOW_ACCURACY_M ? <p className="text-sm text-warning-text">{t("lowAccuracy")}</p> : null}
              <p className="text-sm text-muted">{t("mapGated")}</p>
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={() => onConfirm({ kind: "device", origin: device.origin })}>{t("confirm")}</Button>
                <Button type="button" variant="quiet" onClick={discard}>{t("discard")}</Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
      <section aria-labelledby={id("manual-title")} className="grid gap-4 border-t border-border pt-6">
        <h3 id={id("manual-title")} className="text-lg font-semibold text-ink">{t("manualTitle")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={id("city")} label={t("city")} error={errors.city} required>
            {control => <Input {...control} value={city} onChange={event => setCity(event.target.value)} autoComplete="address-level2" maxLength={60} />}
          </Field>
          <Field id={id("pin")} label={t("pin")} hint={t("pinHint")} error={errors.pin} required>
            {control => <Input {...control} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" autoComplete="postal-code" maxLength={6} className="tabular" />}
          </Field>
        </div>
        {purpose === "booking" ? (
          <Field id={id("line")} label={t("line")} hint={t("lineHint")}>
            {control => <Input {...control} value={line} onChange={event => setLine(event.target.value)} autoComplete="address-line1" maxLength={120} />}
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={confirmManual}>{t("confirm")}</Button>
          <Button type="button" variant="quiet" onClick={discard}>{t("discard")}</Button>
        </div>
      </section>
    </div>
  );
}
