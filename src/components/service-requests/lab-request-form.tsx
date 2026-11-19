"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { formatPaise, type Locale } from "@/lib/format";
import { labLines } from "@/modules/lab-orders/pricing";
import { labOrderInputSchema } from "@/modules/lab-orders/schemas";
import type { LabProvider } from "@/modules/lab-orders/types";
import type { PatientAddress, PatientMember } from "@/modules/patient/schemas";
import type { RequestLine, RequestSlot } from "@/modules/service-requests/core";
import {
  Acknowledge, AddressChoice, FormErrors, FormSection, NoteField, optionClass, PatientChoice, PriceAndPolicy, SubmitArea, TimeChoice,
  useRequestSubmit, type RequestFormActions,
} from "./form-parts";

const IDS = { patient: "lab-patient", address: "lab-address", tests: "lab-tests", time: "lab-time", prep: "lab-prep", note: "lab-note", price: "lab-price" } as const;
const FIELD_TO_ID: Record<string, string> = {
  patientId: IDS.patient, addressId: IDS.address, testIds: IDS.tests, startAt: IDS.time, preparationAcknowledged: IDS.prep, note: IDS.note, policyAccepted: IDS.price,
};

/**
 * Home sample collection request for one lab. Everything the patient picks stays in component state (no URL or
 * storage). The price shown is computed from the lab's catalogue the same way the server does; the server
 * recomputes it and refuses the request if it changed.
 */
export function LabRequestForm({ provider, members, addresses, actions }: { provider: LabProvider; members: PatientMember[]; addresses: PatientAddress[]; actions: RequestFormActions }) {
  const t = useTranslations("services");
  const locale = useLocale() as Locale;
  const self = members.find(member => member.relation === "self");
  const [patientId, setPatientId] = useState<string | null>(self?.patientId ?? null);
  const [addressId, setAddressId] = useState<string | null>(() => addresses.find(address => provider.area.pins.includes(address.pin))?.id ?? null);
  const [testIds, setTestIds] = useState<string[]>([]);
  const [slot, setSlot] = useState<RequestSlot | null>(null);
  const [prep, setPrep] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [note, setNote] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const lines = useMemo(() => { const result = testIds.length ? labLines(provider, testIds) : null; return Array.isArray(result) ? result : null; }, [provider, testIds]);
  const chosen = provider.tests.filter(test => testIds.includes(test.id));
  const preparations = [...new Set(chosen.map(test => test.preparation))];

  const parse = useCallback(() => {
    const result = labOrderInputSchema.safeParse({
      providerId: provider.id, patientId, addressId, startAt: slot?.startAt, testIds, preparationAcknowledged: prep, policyAccepted: accepted,
      expectedTotalPaise: lines ? lines.reduce((sum, line) => sum + line.amountPaise, 0) : 0, ...(note.trim() ? { note: note.trim() } : {}),
    });
    return result.success ? { success: true as const, data: result.data } : { success: false as const, issues: result.error.issues };
  }, [provider.id, patientId, addressId, slot, testIds, prep, accepted, lines, note]);
  const messageFor = useCallback((field: string) => {
    const fieldId = FIELD_TO_ID[field];
    if (!fieldId) return null;
    const message = field === "testIds" || field === "preparationAcknowledged" ? t(`lab.errors.${field}`)
      : t(`common.form.errors.${field === "patientId" ? "patient" : field === "addressId" ? "address" : field as "startAt" | "policyAccepted" | "note"}`);
    return { fieldId, message };
  }, [t]);
  const onConflict = useCallback(() => { setReloadKey(n => n + 1); setAccepted(false); }, []);
  const state = useRequestSubmit({ create: actions.create, segment: "/patient/lab-tests", parse, messageFor, onConflict });
  const lineLabel = (line: RequestLine) => (line.key === "collection" ? t("lab.collectionFee") : line.label);

  return (
    <form className="grid gap-6" noValidate onSubmit={event => { event.preventDefault(); void state.submit(); }}>
      <FormErrors state={state} />
      <PatientChoice id={IDS.patient} members={members} value={patientId} onChange={setPatientId} error={state.errorFor(IDS.patient)} />
      <AddressChoice id={IDS.address} providerName={provider.name} pins={provider.area.pins} addresses={addresses} value={addressId} onChange={setAddressId} error={state.errorFor(IDS.address)} />
      <FormSection id={IDS.tests} title={t("lab.tests")} error={state.errorFor(IDS.tests)} describedBy={`${IDS.tests}-hint`}>
        <p id={`${IDS.tests}-hint`} className="text-sm text-muted">{t("lab.testsHint")}</p>
        {provider.tests.map(test => {
          const on = testIds.includes(test.id);
          return (
            <label key={test.id} className={optionClass(on)}>
              <input type="checkbox" checked={on} onChange={event => setTestIds(ids => event.target.checked ? [...ids, test.id] : ids.filter(id => id !== test.id))}
                className="mt-1 size-5 shrink-0 accent-forest focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus" />
              <span className="grid flex-1 gap-0.5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4"><span className="font-semibold">{test.name}</span><span className="tabular">{formatPaise(test.pricePaise, locale)}</span></span>
                <span className="text-sm text-muted">{t("lab.testLine", { specimen: t(`lab.specimen.${test.specimen}`), preparation: t(`lab.preparation.${test.preparation}`) })}</span>
                <span className="text-sm text-muted">{t("lab.reportIn", { hours: test.reportHours })}</span>
              </span>
            </label>
          );
        })}
      </FormSection>
      <TimeChoice id={IDS.time} providerId={provider.id} load={actions.slots} reloadKey={reloadKey} value={slot} onChange={setSlot} error={state.errorFor(IDS.time)} />
      <Acknowledge id={IDS.prep} title={t("lab.prepTitle")} label={t("lab.prepAck")} checked={prep} onChange={setPrep} error={state.errorFor(IDS.prep)}>
        {preparations.length ? (
          <ul className="grid list-disc gap-1 pl-6 text-base text-ink">{preparations.map(key => <li key={key}>{t(`lab.preparation.${key}`)}</li>)}</ul>
        ) : <p className="text-sm text-muted">{t("lab.prepEmpty")}</p>}
        <p className="text-sm text-muted">{t("lab.reportNote")}</p>
      </Acknowledge>
      <NoteField id={IDS.note} value={note} onChange={setNote} error={state.errorFor(IDS.note)} />
      <PriceAndPolicy id={IDS.price} lines={lines} lineLabel={lineLabel} accepted={accepted} onAccept={setAccepted} error={state.errorFor(IDS.price)} slot={slot} />
      <SubmitArea state={state} onSubmit={() => void state.submit()} manual={t("common.manual")} />
    </form>
  );
}
