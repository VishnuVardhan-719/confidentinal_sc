"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { Notice } from "@/components/shared/notice";
import { careLines } from "@/modules/care-requests/pricing";
import { careRequestInputSchema } from "@/modules/care-requests/schemas";
import type { CareProvider, CareTask } from "@/modules/care-requests/types";
import type { PatientAddress, PatientMember } from "@/modules/patient/schemas";
import type { RequestLine, RequestSlot } from "@/modules/service-requests/core";
import {
  Acknowledge, AddressChoice, FormErrors, FormSection, NoteField, optionClass, PatientChoice, PriceAndPolicy, SubmitArea, TimeChoice,
  useRequestSubmit, type RequestFormActions,
} from "./form-parts";

const IDS = { patient: "care-patient", address: "care-address", tasks: "care-tasks", time: "care-time", hours: "care-hours", scope: "care-scope", note: "care-note", price: "care-price" } as const;
const FIELD_TO_ID: Record<string, string> = {
  patientId: IDS.patient, addressId: IDS.address, tasks: IDS.tasks, startAt: IDS.time, hours: IDS.hours, scopeAcknowledged: IDS.scope, note: IDS.note, policyAccepted: IDS.price,
};

/**
 * One non-clinical home care shift. The hours and tasks stay in component state; the hourly rate is the
 * provider's, the total is recomputed on the server, and repeating plans are not offered.
 */
export function CareRequestForm({ provider, members, addresses, actions }: { provider: CareProvider; members: PatientMember[]; addresses: PatientAddress[]; actions: RequestFormActions }) {
  const t = useTranslations("services");
  const hoursId = IDS.hours;
  const self = members.find(member => member.relation === "self");
  const [patientId, setPatientId] = useState<string | null>(self?.patientId ?? null);
  const [addressId, setAddressId] = useState<string | null>(() => addresses.find(address => provider.area.pins.includes(address.pin))?.id ?? null);
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [hours, setHours] = useState<number | null>(null);
  const [slot, setSlot] = useState<RequestSlot | null>(null);
  const [scope, setScope] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [note, setNote] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const lines = useMemo(() => { const result = hours ? careLines(provider, hours) : null; return Array.isArray(result) ? result : null; }, [provider, hours]);
  const range = Array.from({ length: provider.maxHours - provider.minHours + 1 }, (_, i) => provider.minHours + i);

  const parse = useCallback(() => {
    const result = careRequestInputSchema.safeParse({
      providerId: provider.id, patientId, addressId, startAt: slot?.startAt, tasks, hours: hours ?? undefined, scopeAcknowledged: scope, policyAccepted: accepted,
      expectedTotalPaise: lines ? lines.reduce((sum, line) => sum + line.amountPaise, 0) : 0, ...(note.trim() ? { note: note.trim() } : {}),
    });
    return result.success ? { success: true as const, data: result.data } : { success: false as const, issues: result.error.issues };
  }, [provider.id, patientId, addressId, slot, tasks, hours, scope, accepted, lines, note]);
  const messageFor = useCallback((field: string) => {
    const fieldId = FIELD_TO_ID[field];
    if (!fieldId) return null;
    const message = field === "tasks" || field === "hours" || field === "scopeAcknowledged" ? t(`care.errors.${field}`)
      : t(`common.form.errors.${field === "patientId" ? "patient" : field === "addressId" ? "address" : field as "startAt" | "policyAccepted" | "note"}`);
    return { fieldId, message };
  }, [t]);
  const onConflict = useCallback(() => { setReloadKey(n => n + 1); setAccepted(false); }, []);
  const state = useRequestSubmit({ create: actions.create, segment: "/patient/caretakers", parse, messageFor, onConflict });
  const lineLabel = (line: RequestLine) => (line.key === "hours" ? t("care.lineHours") : line.label);
  const hoursError = state.errorFor(IDS.hours);

  return (
    <form className="grid gap-6" noValidate onSubmit={event => { event.preventDefault(); void state.submit(); }}>
      <FormErrors state={state} />
      <Notice tone="info" title={t("care.scopeTitle")}>{t("care.scopeBody")}</Notice>
      <PatientChoice id={IDS.patient} members={members} value={patientId} onChange={setPatientId} error={state.errorFor(IDS.patient)} />
      <AddressChoice backHref="/patient/caretakers" id={IDS.address} providerName={provider.name} pins={provider.area.pins} addresses={addresses} value={addressId} onChange={setAddressId} error={state.errorFor(IDS.address)} />
      <FormSection id={IDS.tasks} title={t("care.tasks")} error={state.errorFor(IDS.tasks)} describedBy={`${IDS.tasks}-hint`}>
        <p id={`${IDS.tasks}-hint`} className="text-sm text-muted">{t("care.tasksHint")}</p>
        {provider.tasks.map(task => {
          const on = tasks.includes(task);
          return (
            <label key={task} className={optionClass(on)}>
              <input type="checkbox" checked={on} onChange={event => setTasks(list => event.target.checked ? [...list, task] : list.filter(item => item !== task))}
                className="mt-1 size-5 shrink-0 accent-forest focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus" />
              <span>{t(`care.task.${task}`)}</span>
            </label>
          );
        })}
      </FormSection>
      <div className="grid gap-2 rounded-lg border border-border bg-surface p-5 sm:p-6">
        <label htmlFor={hoursId} className="text-lg font-semibold text-ink">{t("care.hours")}</label>
        <p id={`${hoursId}-hint`} className="text-sm text-muted">{t("care.hoursHint", { min: provider.minHours, max: provider.maxHours })}</p>
        {hoursError ? <p id={`${hoursId}-error`} className="text-sm font-medium text-danger">{hoursError}</p> : null}
        <select id={hoursId} value={hours ?? ""} onChange={event => setHours(event.target.value ? Number(event.target.value) : null)}
          aria-describedby={[`${hoursId}-hint`, hoursError ? `${hoursId}-error` : null].filter(Boolean).join(" ")} aria-invalid={hoursError ? true : undefined}
          className="min-h-target w-48 rounded-md border border-border-strong bg-surface px-3 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <option value="">{t("care.hours")}</option>
          {range.map(value => <option key={value} value={value}>{t("care.hoursValue", { hours: value })}</option>)}
        </select>
        <p className="text-sm text-muted">{t("care.recurring")}</p>
      </div>
      <TimeChoice backHref="/patient/caretakers" hours={hours} id={IDS.time} providerId={provider.id} load={actions.slots} reloadKey={reloadKey} value={slot} onChange={setSlot} error={state.errorFor(IDS.time)} />
      <Acknowledge id={IDS.scope} title={t("care.scopeTitle")} label={t("care.scopeAck")} checked={scope} onChange={setScope} error={state.errorFor(IDS.scope)} />
      <NoteField id={IDS.note} value={note} onChange={setNote} error={state.errorFor(IDS.note)} />
      <PriceAndPolicy id={IDS.price} lines={lines} lineLabel={lineLabel} accepted={accepted} onAccept={setAccepted} error={state.errorFor(IDS.price)} slot={slot} />
      <SubmitArea state={state} onSubmit={() => void state.submit()} manual={t("common.manual")} />
    </form>
  );
}
