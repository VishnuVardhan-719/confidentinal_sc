import type { CommandOutcome } from "@/modules/doctor/loaders";

/** Message key for a non-done command outcome (all keys live in the doctor namespace). */
export function outcomeMessageKey(o: Exclude<CommandOutcome, { kind: "done" }>): string {
  return `doctor.${o.messageKey.replace(/^doctor\./, "")}`;
}
