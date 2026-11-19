"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatPaise, type Locale } from "@/lib/format";
import { ambulanceLines } from "@/modules/ambulance-requests/pricing";
import { ambulanceRequestInputSchema } from "@/modules/ambulance-requests/schemas";
import { DESTINATION_KINDS, MOBILITY, VEHICLE_FITS, type AmbulanceProvider, type DestinationKind, type Mobility, type VehicleType } from "@/modules/ambulance-requests/types";
import type { PatientAddress, PatientMember } from "@/modules/patient/schemas";
import type { RequestLine, RequestSlot } from "@/modules/service-requests/core";
import {
  Acknowledge, AddressChoice, FormErrors, FormSection, NoteField, optionClass, PatientChoice, PriceAndPolicy, SubmitArea, TimeChoice,
  useRequestSubmit, type RequestFormActions,
} from "./form-parts";

const IDS = {
  patient: "amb-patient", mobility: "amb-mobility", vehicle: "amb-vehicle", pickup: "amb-pickup", destination: "amb-destination",
  time: "amb-time", emergency: "amb-not-emergency", note: "amb-note", price: "amb-price",
} as const;
const FIELD_TO_ID: Record<string, string> = {
  patientId: IDS.patient, mobility: IDS.mobility, vehicleType: IDS.vehicle, addressId: IDS.pickup, destination: IDS.destination,
  startAt: IDS.time, notEmergency: IDS.emergency, note: IDS.note, policyAccepted: IDS.price,
};
const radioClass = "mt-1 size-5 shrink-0 accent-forest focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * A scheduled, non-emergency transfer: patient, mobility, a vehicle that fits, pickup (a saved address),
 * drop-off inside the operator's area, time and the explicit "not an emergency" confirmation. No live
 * dispatch, tracking or arrival time. The fare is the operator's fixed fare, recomputed on the server.
 */
export function AmbulanceRequestForm({ provider, members, addresses, actions }: { provider: AmbulanceProvider; members: PatientMember[]; addresses: PatientAddress[]; actions: RequestFormActions }) {
  const t = useTranslations("services");
  const locale = useLocale() as Locale;
  const self = members.find(member => member.relation === "self");
  const [patientId, setPatientId] = useState<string | null>(self?.patientId ?? null);
  const [mobility, setMobility] = useState<Mobility | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [addressId, setAddressId] = useState<string | null>(() => addresses.find(address => provider.area.pins.includes(address.pin))?.id ?? null);
  const [destination, setDestination] = useState<{ kind: DestinationKind; name: string; locality: string; city: string; pin: string }>({ kind: "hospital", name: "", locality: "", city: "", pin: "" });
  const [companion, setCompanion] = useState(false);
  const [slot, setSlot] = useState<RequestSlot | null>(null);
  const [notEmergency, setNotEmergency] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [note, setNote] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const fits = (type: VehicleType) => !mobility || VEHICLE_FITS[mobility].includes(type);
  const lines = useMemo(() => { const result = vehicleType ? ambulanceLines(provider, vehicleType) : null; return Array.isArray(result) ? result : null; }, [provider, vehicleType]);

  const parse = useCallback(() => {
    const result = ambulanceRequestInputSchema.safeParse({
      providerId: provider.id, patientId, addressId, startAt: slot?.startAt, vehicleType, mobility, companion, notEmergency, policyAccepted: accepted,
      destination: { kind: destination.kind, locality: destination.locality.trim(), city: destination.city.trim(), pin: destination.pin, ...(destination.name.trim() ? { name: destination.name.trim() } : {}) },
      expectedTotalPaise: lines ? lines.reduce((sum, line) => sum + line.amountPaise, 0) : 0, ...(note.trim() ? { note: note.trim() } : {}),
    });
    // The drop-off PIN must be in the operator's area; the server checks this too.
    if (result.success && !provider.area.pins.includes(result.data.destination.pin)) return { success: false as const, issues: [{ path: ["destination"] }] };
    return result.success ? { success: true as const, data: result.data } : { success: false as const, issues: result.error.issues };
  }, [provider, patientId, addressId, slot, vehicleType, mobility, companion, notEmergency, accepted, destination, lines, note]);
  const messageFor = useCallback((field: string) => {
    const fieldId = FIELD_TO_ID[field];
    if (!fieldId) return null;
    const own = ["vehicleType", "mobility", "destination", "notEmergency"] as const;
    const message = (own as readonly string[]).includes(field) ? t(`ambulance.errors.${field as (typeof own)[number]}`)
      : t(`common.form.errors.${field === "patientId" ? "patient" : field === "addressId" ? "address" : field as "startAt" | "policyAccepted" | "note"}`);
    return { fieldId, message };
  }, [t]);
  const onConflict = useCallback(() => { setReloadKey(n => n + 1); setAccepted(false); }, []);
  const state = useRequestSubmit({ create: actions.create, segment: "/patient/ambulance", parse, messageFor, onConflict });
  const vehicleName = (type: VehicleType) => t(`ambulance.vehicleType.${type}`);
  const lineLabel = (line: RequestLine) => (line.key.startsWith("vehicle:") ? t("ambulance.lineTransfer", { vehicle: vehicleName(line.key.slice(8) as VehicleType) }) : line.label);
  const destError = state.errorFor(IDS.destination);
  const field = (key: "locality" | "city" | "pin", label: string, extra: Record<string, unknown> = {}) => (
    <div className="grid gap-1">
      <label htmlFor={`${IDS.destination}-${key}`} className="text-base font-medium text-ink">{label}</label>
      <Input id={`${IDS.destination}-${key}`} value={destination[key]} aria-invalid={destError ? true : undefined} aria-describedby={destError ? `${IDS.destination}-error` : undefined}
        onChange={event => setDestination(d => ({ ...d, [key]: key === "pin" ? event.target.value.replace(/\D/g, "") : event.target.value }))} {...extra} />
    </div>
  );

  return (
    <form className="grid gap-6" noValidate onSubmit={event => { event.preventDefault(); void state.submit(); }}>
      <FormErrors state={state} />
      <PatientChoice id={IDS.patient} members={members} value={patientId} onChange={setPatientId} error={state.errorFor(IDS.patient)} />
      <FormSection id={IDS.mobility} title={t("ambulance.mobility")} error={state.errorFor(IDS.mobility)}>
        {MOBILITY.map(value => (
          <label key={value} className={optionClass(mobility === value)}>
            <input type="radio" name="amb-mobility" value={value} checked={mobility === value} className={radioClass}
              onChange={() => { setMobility(value); if (vehicleType && !VEHICLE_FITS[value].includes(vehicleType)) setVehicleType(null); }} />
            <span>{t(`ambulance.mobilityValue.${value}`)}</span>
          </label>
        ))}
      </FormSection>
      <FormSection id={IDS.vehicle} title={t("ambulance.vehicle")} error={state.errorFor(IDS.vehicle)} describedBy={`${IDS.vehicle}-hint`}>
        <p id={`${IDS.vehicle}-hint`} className="text-sm text-muted">{t("ambulance.vehicleHint")}</p>
        {provider.vehicles.map(vehicle => {
          const ok = fits(vehicle.type);
          return (
            <label key={vehicle.type} className={optionClass(vehicleType === vehicle.type, !ok)}>
              <input type="radio" name="amb-vehicle" value={vehicle.type} checked={vehicleType === vehicle.type} disabled={!ok} onChange={() => setVehicleType(vehicle.type)} className={radioClass} />
              <span className="grid flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4"><span className="font-semibold">{vehicleName(vehicle.type)}</span><span className="tabular">{t("ambulance.fare", { price: formatPaise(vehicle.farePaise, locale) })}</span></span>
                {!ok ? <span className="text-sm">{t("ambulance.vehicleUnfit")}</span> : null}
              </span>
            </label>
          );
        })}
      </FormSection>
      <AddressChoice id={IDS.pickup} title={t("ambulance.pickup")} providerName={provider.name} pins={provider.area.pins} addresses={addresses} value={addressId} onChange={setAddressId} error={state.errorFor(IDS.pickup)} />
      <FormSection id={IDS.destination} title={t("ambulance.destination")} error={destError} describedBy={`${IDS.destination}-area`}>
        <p id={`${IDS.destination}-area`} className="text-base text-ink">{t("ambulance.destinationArea", { pins: provider.area.pins.join(", ") })}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("ambulance.destination")}>
          {DESTINATION_KINDS.map(kind => (
            <label key={kind} className={optionClass(destination.kind === kind)}>
              <input type="radio" name="amb-destination-kind" value={kind} checked={destination.kind === kind} onChange={() => setDestination(d => ({ ...d, kind }))} className={radioClass} />
              <span>{t(`ambulance.destinationKind.${kind}`)}</span>
            </label>
          ))}
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${IDS.destination}-name`} className="text-base font-medium text-ink">{t("ambulance.destinationName")}</label>
          <p id={`${IDS.destination}-name-hint`} className="text-sm text-muted">{t("ambulance.destinationNameHint")}</p>
          <Input id={`${IDS.destination}-name`} value={destination.name} maxLength={80} aria-describedby={`${IDS.destination}-name-hint`} onChange={event => setDestination(d => ({ ...d, name: event.target.value }))} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("locality", t("ambulance.locality"), { maxLength: 80, autoComplete: "off" })}
          {field("city", t("ambulance.city"), { maxLength: 60, autoComplete: "off" })}
          {field("pin", t("ambulance.pin"), { maxLength: 6, inputMode: "numeric", autoComplete: "off" })}
        </div>
        <label className="flex min-h-target cursor-pointer items-start gap-3 text-base text-ink">
          <input type="checkbox" checked={companion} onChange={event => setCompanion(event.target.checked)} className={radioClass} />
          <span>{t("ambulance.companion")}</span>
        </label>
      </FormSection>
      <TimeChoice id={IDS.time} providerId={provider.id} load={actions.slots} reloadKey={reloadKey} value={slot} onChange={setSlot} error={state.errorFor(IDS.time)} />
      <Acknowledge id={IDS.emergency} title={t("ambulance.notEmergencyTitle")} label={t("ambulance.notEmergency")} checked={notEmergency} onChange={setNotEmergency} error={state.errorFor(IDS.emergency)}>
        <p className="text-sm text-muted">{t("ambulance.noTracking")}</p>
      </Acknowledge>
      <NoteField id={IDS.note} value={note} onChange={setNote} error={state.errorFor(IDS.note)} />
      <PriceAndPolicy id={IDS.price} lines={lines} lineLabel={lineLabel} accepted={accepted} onAccept={setAccepted} error={state.errorFor(IDS.price)} slot={slot} />
      <SubmitArea state={state} onSubmit={() => void state.submit()} manual={t("common.manual")} />
    </form>
  );
}
