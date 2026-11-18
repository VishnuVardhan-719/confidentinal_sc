"use client";

import { useId, useState } from "react";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { formatInr } from "@/lib/demo/data";
import { bookHref, type SlotDay } from "./demo-providers";

export type ServiceOption = { id: string; name: string; pricePaise: number; durationMin: number };

const option =
  "relative flex cursor-pointer rounded-md border border-[var(--line)] bg-white transition-colors duration-150 " +
  "hover:border-[var(--forest)] has-[:checked]:border-[var(--forest)] has-[:checked]:bg-[var(--mist)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--forest)] " +
  "has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] motion-reduce:transition-none";

/**
 * Choose a demo service and a time, then continue to the demo request flow.
 * No network calls: the link only carries ids, and payment is never collected here.
 */
export function SlotPicker({
  providerId,
  services,
  days,
}: {
  providerId: string;
  services: ServiceOption[];
  days: SlotDay[];
}) {
  const uid = useId();
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0].id : "");
  const [slot, setSlot] = useState("");
  const service = services.find((s) => s.id === serviceId);
  const picked = days.flatMap((d) => d.slots).find((s) => s.iso === slot);
  const summaryId = `${uid}-summary`;

  return (
    <div className="grid gap-10">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-4 font-[family-name:var(--font-editorial)] text-[clamp(1.5rem,2.4vw,1.875rem)] leading-tight">
          Choose a service
        </legend>
        <div className="grid gap-3">
          {services.map((s) => (
            <label key={s.id} className={`${option} items-center justify-between gap-4 px-4 py-3.5`}>
              <input
                type="radio"
                name={`${uid}-service`}
                value={s.id}
                checked={serviceId === s.id}
                onChange={() => setServiceId(s.id)}
                className="sr-only"
              />
              <span className="grid gap-0.5">
                <span className="font-semibold text-[var(--ink)]">{s.name}</span>
                <span className="text-[0.9375rem] text-[var(--ink-soft)]">About {s.durationMin} min</span>
              </span>
              <span className="text-lg font-semibold text-[var(--ink)] tabular-nums">{formatInr(s.pricePaise)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1 font-[family-name:var(--font-editorial)] text-[clamp(1.5rem,2.4vw,1.875rem)] leading-tight">
          Choose a time
        </legend>
        <p className="mb-4 text-[0.9375rem] text-[var(--ink-soft)]">All times are India Standard Time (IST).</p>
        {days.length === 0 ? (
          <EmptyState title="No demo times listed" message="This demo provider has no open times to show." />
        ) : (
          <div className="grid gap-6">
            {days.map((d) => (
              <div key={d.dayKey} role="group" aria-labelledby={`${uid}-${d.dayKey}`}>
                <p id={`${uid}-${d.dayKey}`} className="mb-2 text-sm font-semibold text-[var(--ink)]">
                  {d.day}
                </p>
                <div className="flex flex-wrap gap-2">
                  {d.slots.map((s) => (
                    <label key={s.iso} className={`${option} min-h-11 items-center px-4 font-semibold tabular-nums`}>
                      <input
                        type="radio"
                        name={`${uid}-slot`}
                        value={s.iso}
                        checked={slot === s.iso}
                        onChange={() => setSlot(s.iso)}
                        className="sr-only"
                      />
                      <span className="sr-only">{d.day}, </span>
                      {s.time}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 border-t border-[var(--ink)] pt-6">
        <p id={summaryId} role="status" aria-live="polite" className="text-[var(--ink)]">
          {service && picked ? (
            <>
              <span className="font-semibold">{service.name}</span> on {picked.day} at {picked.time} IST,{" "}
              <span className="tabular-nums">{formatInr(service.pricePaise)}</span> (demo price).
            </>
          ) : (
            <span className="text-[var(--ink-soft)]">
              {!service && !picked ? "Choose a service and a time to continue." : !service ? "Choose a service to continue." : "Choose a time to continue."}
            </span>
          )}
        </p>
        <div className="actions">
          {service && picked ? (
            <ButtonLink href={bookHref(providerId, service.id, picked.iso)} aria-describedby={summaryId}>
              Continue to request
            </ButtonLink>
          ) : (
            <Button disabled aria-describedby={summaryId}>
              Continue to request
            </Button>
          )}
        </div>
        <p className="text-[0.9375rem] text-[var(--ink-soft)]">
          This is a demo. Sending a request does not book a real appointment, and no payment is collected.
        </p>
      </div>
    </div>
  );
}
