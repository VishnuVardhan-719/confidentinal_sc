import type { DoctorApi } from "@/modules/doctor/api";
import { parseRouteId, toPageState, type PageState } from "@/modules/doctor/routing";
import type { AssignedVisitView } from "@/modules/doctor/types";
import type { RecordsApi } from "@/modules/records/api";
import { isDoctorVerified } from "@/modules/records/logic";
import type { HealthFactView } from "@/modules/records/types";
import type { ClinicalApi } from "./api";
import { allergyBanner, type AllergyBanner } from "./editor";
import { isClinicalEnabled } from "./gate";
import type { DraftSnapshot, SignedConsultation } from "./types";

type Env = Record<string, string | undefined>;

/**
 * Server loader for /[locale]/doctor/visits/[id]/consultation. Order matters:
 * gate first (no data fetched when clinical is off), then route-id validation, then the
 * assigned-visit check (other doctors are denied before any clinical read).
 */
export type ConsultationWorkspaceData =
  | { mode: "not_started"; visit: AssignedVisitView }
  | { mode: "editor"; visit: AssignedVisitView; draft: DraftSnapshot; allergies: AllergyBanner; healthFacts: PageState<HealthFactView[]>; writable: boolean }
  | { mode: "signed"; visit: AssignedVisitView; record: SignedConsultation };

export type ClinicalLoaderDeps = { doctor: DoctorApi; clinical: ClinicalApi; records: RecordsApi; env?: Env };

export const allergyFacts = (facts: readonly HealthFactView[]) =>
  facts.filter((f) => f.kind === "allergy").map((f) => ({ value: f.current.value, verified: isDoctorVerified(f.current) }));

export async function loadConsultationWorkspace(deps: ClinicalLoaderDeps, rawBookingId: unknown): Promise<PageState<ConsultationWorkspaceData>> {
  if (!isClinicalEnabled(deps.env ?? process.env)) return { kind: "gated" };
  const bookingId = parseRouteId(rawBookingId);
  if (!bookingId) return { kind: "not_found" };

  const visit = await deps.doctor.getVisit(bookingId);
  if (!visit.ok) return toPageState(visit);
  const v = visit.data;
  if (!v.consultationId) return { kind: "ready", data: { mode: "not_started", visit: v } };

  const consultation = await deps.clinical.getConsultation(v.consultationId);
  if (!consultation.ok) return toPageState(consultation);
  if (consultation.data.status === "final") return { kind: "ready", data: { mode: "signed", visit: v, record: consultation.data } };

  // Facts are supplementary: a failure shows "unknown", it never blocks the editor.
  const facts = await deps.records.listHealthFacts(bookingId);
  const healthFacts = toPageState(facts, (d) => d.length === 0);
  const allergies = allergyBanner(v.hasKnownAllergies, facts.ok ? allergyFacts(facts.data) : null);
  const writable = v.state === "in_progress" && v.phase === "service_started";
  return { kind: "ready", data: { mode: "editor", visit: v, draft: consultation.data, allergies, healthFacts, writable } };
}

/** Signed record view for the clinician (read-only + amendment entry point). */
export async function loadSignedRecord(deps: Pick<ClinicalLoaderDeps, "clinical" | "env">, rawConsultationId: unknown): Promise<PageState<SignedConsultation>> {
  if (!isClinicalEnabled(deps.env ?? process.env)) return { kind: "gated" };
  const id = parseRouteId(rawConsultationId);
  if (!id) return { kind: "not_found" };
  const r = await deps.clinical.getConsultation(id);
  if (!r.ok) return toPageState(r);
  // Drafts are not records: the record route never renders one.
  return r.data.status === "final" ? { kind: "ready", data: r.data } : { kind: "not_found" };
}
