"use client";

import { Crosshair, MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormObject } from "./form-spec";
import { formatCoordinates } from "./coordinates";

/**
 * Pinned location for the patient profile (USER-REQ-1 C/D). Browser geolocation runs only after
 * the user presses the button (explicit consent); denied/unavailable/timeout states are shown.
 * Coordinates live in form state until the user saves the profile; they are never put in the URL,
 * storage or logs. A map pin needs an approved maps vendor (gated), so manual entry is the fallback.
 * Replace with the shared LocationPicker once fe-a exports it (docs/frontend/REQUESTS.md).
 */
type GeoState = "idle" | "requesting" | "denied" | "unavailable" | "timeout" | "unsupported";

const str = (v: unknown) => (typeof v === "string" ? v : "");


export function LocationField({
  id,
  label,
  hintText,
  error,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hintText?: string;
  error?: string;
  value: FormObject;
  disabled: boolean;
  onChange: (next: FormObject) => void;
}) {
  const t = useTranslations("onboarding.form.location");
  const [geo, setGeo] = useState<GeoState>("idle");
  const [manual, setManual] = useState(false);
  const lat = Number(str(value.lat));
  const lng = Number(str(value.lng));
  const hasValue = str(value.lat) !== "" && str(value.lng) !== "" && Number.isFinite(lat) && Number.isFinite(lng);
  const accuracy = Number(str(value.accuracyM));

  function useDevice() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator) || !window.isSecureContext) {
      setGeo("unsupported");
      return;
    }
    setGeo("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo("idle");
        onChange({
          lat: String(Math.round(pos.coords.latitude * 1e6) / 1e6),
          lng: String(Math.round(pos.coords.longitude * 1e6) / 1e6),
          accuracyM: String(Math.round(pos.coords.accuracy)),
          source: "device",
          capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        });
      },
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <fieldset id={id} className="grid gap-3" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="text-base font-semibold text-ink">{label}</legend>
      {hintText ? <p className="-mt-1 text-sm text-muted">{hintText}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <p className="flex items-center gap-2 text-base text-ink" aria-live="polite">
        <MapPin aria-hidden className="size-5 text-forest" />
        {hasValue ? (
          <span className="tabular">
            {formatCoordinates(lat, lng, Number.isFinite(accuracy) ? accuracy : null)}
            <span className="ml-2 text-sm text-muted">{str(value.source) === "device" ? t("fromDevice") : t("manual")}</span>
          </span>
        ) : (
          <span className="text-muted">{t("notSet")}</span>
        )}
      </p>

      <p className="text-sm text-muted">{t("consent")}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={useDevice} disabled={disabled || geo === "requesting"} aria-busy={geo === "requesting"}>
          <Crosshair aria-hidden />
          {geo === "requesting" ? t("locating") : t("useDevice")}
        </Button>
        <Button variant="quiet" onClick={() => setManual((m) => !m)} disabled={disabled} aria-expanded={manual} aria-controls={`${id}-manual`}>
          {t("enterManually")}
        </Button>
        {hasValue ? (
          <Button variant="quiet" onClick={() => onChange({ lat: "", lng: "", accuracyM: "", source: "", capturedAt: "" })} disabled={disabled}>
            <X aria-hidden />
            {t("clear")}
          </Button>
        ) : null}
      </div>

      {geo === "denied" || geo === "unavailable" || geo === "timeout" || geo === "unsupported" ? (
        <Notice tone="warning" role="alert">
          {t(`error.${geo}`)}
        </Notice>
      ) : null}

      {manual ? (
        <div id={`${id}-manual`} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            {t("latitude")}
            <Input
              inputMode="decimal"
              value={str(value.lat)}
              onChange={(e) => onChange({ ...value, lat: e.target.value, source: "manual_pin", accuracyM: "0", capturedAt: new Date().toISOString() })}
              disabled={disabled}
              className="tabular"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            {t("longitude")}
            <Input
              inputMode="decimal"
              value={str(value.lng)}
              onChange={(e) => onChange({ ...value, lng: e.target.value, source: "manual_pin", accuracyM: "0", capturedAt: new Date().toISOString() })}
              disabled={disabled}
              className="tabular"
            />
          </label>
          <p className="text-sm text-muted sm:col-span-2">{t("mapUnavailable")}</p>
        </div>
      ) : null}
    </fieldset>
  );
}
