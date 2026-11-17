"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { allApplications, formatSlot, type Decision } from "./demo-model";
import { dispatchDemo, useDemoState } from "./demo-store";
import { Icon } from "./icons";

const KIND_LABEL: Record<string, string> = {
  doctor: "Doctor",
  lab: "Lab",
  ambulance: "Scheduled ambulance",
  "scheduled-ambulance": "Scheduled ambulance",
  caretaker: "Caretaker",
};

const DECISION_LABEL: Record<Decision, string> = { approved: "Approved (demo)", rejected: "Rejected (demo)" };

/**
 * Verification queue over demo applications. Approve / Reject / Undo only change this tab's state.
 * Real approval will require checking documents through short-lived private links.
 */
export function AdminQueue() {
  const demo = useDemoState();
  const [view, setView] = useState<"pending" | "decided">("pending");
  const [announcement, setAnnouncement] = useState("");
  const apps = allApplications(demo);
  const pending = apps.filter((a) => !demo.decisions[a.id]);
  const decided = apps.filter((a) => demo.decisions[a.id]);
  const rows = view === "pending" ? pending : decided;

  function decide(id: string, name: string, decision: Decision | null) {
    dispatchDemo({ type: "decide", id, decision });
    setAnnouncement(decision ? `${name}: ${DECISION_LABEL[decision]}.` : `${name} moved back to pending.`);
  }

  const tab = (key: "pending" | "decided", label: string, count: number) => (
    <button
      type="button"
      aria-pressed={view === key}
      onClick={() => setView(key)}
      className={cx(
        "inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-[0.9375rem] font-semibold",
        "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]",
        view === key ? "bg-[var(--forest)] text-[var(--paper)]" : "text-[var(--forest)] hover:bg-[var(--mist)]",
      )}
    >
      {label}
      <span className="tabular-nums">({count})</span>
    </button>
  );

  return (
    <div>
      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
      <div role="group" aria-label="Show" className="mb-4 flex flex-wrap gap-2">
        {tab("pending", "Pending", pending.length)}
        {tab("decided", "Decided", decided.length)}
      </div>

      {rows.length ? (
        <ul className="m-0 list-none border-t border-[var(--ink)] p-0">
          {rows.map((a) => {
            const decision = demo.decisions[a.id];
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[var(--line)] py-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">{a.name}</p>
                  <p className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">
                    {KIND_LABEL[a.kind] ?? a.kind} · submitted {formatSlot(a.submittedAt)}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[0.875rem] text-[var(--ink-soft)]">
                    <Icon name="lock" className="size-4" />
                    Documents: none uploaded in the demo
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {decision ? (
                    <>
                      <span className="text-[0.9375rem] font-semibold">{DECISION_LABEL[decision]}</span>
                      <Button variant="quiet" onClick={() => decide(a.id, a.name, null)} aria-label={`Undo decision for ${a.name}`}>
                        Undo
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => decide(a.id, a.name, "approved")} aria-label={`Approve ${a.name}`}>
                        Approve
                      </Button>
                      <Button variant="secondary" onClick={() => decide(a.id, a.name, "rejected")} aria-label={`Reject ${a.name}`}>
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-[var(--line-strong)] px-5 py-12 text-center">
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-[var(--mist)] text-[var(--forest)]">
            <Icon name="queue" className="size-5" />
          </span>
          <p className="font-bold">{view === "pending" ? "No profiles to review" : "No decisions yet"}</p>
          <p className="max-w-[30rem] text-[var(--ink-soft)]">
            {view === "pending"
              ? "Every submitted profile has a decision. New ones appear here when providers submit them."
              : "Approved and rejected profiles appear here."}
          </p>
        </div>
      )}
    </div>
  );
}
