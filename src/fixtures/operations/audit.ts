import type { RawAuditEvent } from "@/modules/audit/types";
import { SYNTHETIC_MARKER } from "./guard";

/**
 * SYNTHETIC raw audit events, deliberately including fields that must be
 * redacted (fake token, fake phone, fake OTP, nested payload) to exercise the
 * redactor. All values are fictional.
 */
const rawEvents: RawAuditEvent[] = [
  {
    id: "fx-aud-1",
    occurredAt: "2026-11-18T06:00:00Z",
    actor: { profileId: "fx-adm-verifier", kind: "admin" },
    action: "provider.review_decided",
    category: "verification",
    target: { type: "provider", id: "fx-prov-amb-1" },
    organizationId: "fx-org-1",
    outcome: "success",
    reasonCode: null,
    reason: "Evidence verified. Called operator on +91 90000 00000 to confirm.",
    correlationId: "fx-corr-1",
    metadata: { decision: "approved", fromState: "under_review", toState: "approved", version: 7, accessToken: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmeCJ9.c2lnbmF0dXJl" },
  },
  {
    id: "fx-aud-2",
    occurredAt: "2026-11-19T04:30:00Z",
    actor: { profileId: "fx-prof-driver-b", kind: "provider_staff" },
    action: "trip.interrupted",
    category: "booking",
    target: { type: "booking", id: "fx-amb-booking-4" },
    organizationId: "fx-org-1",
    outcome: "success",
    reasonCode: "patient_not_present",
    correlationId: "fx-corr-2",
    metadata: { reasonCode: "patient_not_present", address: "Fixture street 1", phone: "+919000000000", payload: { note: "nested" } },
  },
  {
    id: "fx-aud-3",
    occurredAt: "2026-11-19T05:00:00Z",
    actor: { profileId: "fx-prof-driver-a", kind: "provider_staff" },
    action: "trip.picked_up",
    category: "booking",
    target: { type: "booking", id: "fx-amb-booking-2" },
    organizationId: "fx-org-1",
    outcome: "denied",
    reasonCode: "not_assigned",
    correlationId: "fx-corr-3",
    metadata: { otp: "482913" },
  },
  {
    id: "fx-aud-4",
    occurredAt: "2026-11-19T07:00:00Z",
    actor: { profileId: "fx-adm-publisher", kind: "admin" },
    action: "content.published",
    category: "content",
    target: { type: "content_entry", id: "fx-cms-faq-1" },
    organizationId: null,
    outcome: "success",
    reasonCode: null,
    correlationId: "fx-corr-4",
    metadata: { locale: "en", revision: 1 },
  },
  {
    id: "fx-aud-5",
    occurredAt: "2026-11-19T08:00:00Z",
    actor: { profileId: "fx-prof-lab2-owner", kind: "admin" },
    action: "provider.review_decided",
    category: "verification",
    target: { type: "provider", id: "fx-prov-lab-2" },
    organizationId: "fx-org-2",
    outcome: "denied",
    reasonCode: "self_approval",
    correlationId: "fx-corr-5",
    metadata: { decision: "approved", authorization: "Bearer fx-not-a-real-token" },
  },
];

export const auditFixtures = { ...SYNTHETIC_MARKER, rawEvents };
