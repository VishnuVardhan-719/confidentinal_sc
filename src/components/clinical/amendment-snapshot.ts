import type { ClinicalDraftContent } from "@/modules/clinical/schemas";
import { latestSigned, type SignedConsultation } from "@/modules/clinical/types";

/**
 * The version an amendment is based on is the one whose content the clinician started editing.
 * Taking `currentVersion` at submit time instead would let a refreshed record silently rebase
 * the edits onto a newer version the clinician never saw (CodeRabbit on 0f4b8da). With the
 * mount-time base, the server rejects a stale base and the UI shows the conflict.
 */
export function amendmentSnapshot(record: SignedConsultation): { baseVersion: number; content: ClinicalDraftContent } {
  const latest = latestSigned(record);
  return { baseVersion: latest.version, content: structuredClone(latest.content) };
}
