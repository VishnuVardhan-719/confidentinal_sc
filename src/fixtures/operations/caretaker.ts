import type { CareActor, CareAssignment, CaregiverProfile, CareRequest, CareService, CareShift } from "@/modules/caretaker/types";
import { SYNTHETIC_MARKER } from "./guard";

/** SYNTHETIC caretaker/agency scenarios. Fictional agency, caregivers and PINs. */

const AGENCY_PROVIDER = "fx-care-provider-agency";
const AGENCY = "fx-care-agency-1";
const INDEPENDENT_PROVIDER = "fx-care-provider-indep";

const services: CareService[] = [
  {
    id: "fx-care-svc-1",
    providerId: AGENCY_PROVIDER,
    title: "Synthetic companionship and mobility help",
    taskCodes: ["companionship", "mobility_assistance", "meal_assistance"],
    rates: [
      { period: "hour", amountPaise: 30000, periodSupportedByBackend: true },
      { period: "day", amountPaise: 200000, periodSupportedByBackend: true },
      { period: "week", amountPaise: 1200000, periodSupportedByBackend: false },
      { period: "month", amountPaise: 4500000, periodSupportedByBackend: false },
    ],
    coveragePins: ["999901", "999902"],
    active: true,
    version: 2,
  },
  {
    id: "fx-care-svc-2",
    providerId: AGENCY_PROVIDER,
    title: "Synthetic escort to appointment",
    taskCodes: ["escort_to_appointment"],
    rates: [{ period: "hour", amountPaise: 35000, periodSupportedByBackend: true }],
    coveragePins: ["999901"],
    active: false,
    version: 1,
  },
];

const staff: CaregiverProfile[] = [
  { resourceId: "fx-res-care-a", profileId: "fx-prof-care-a", displayName: "Fixture Caregiver A", agencyId: AGENCY, skills: ["companionship", "mobility_assistance", "meal_assistance"], languages: ["en", "te"], credentialStatus: "verified", membershipStatus: "active" },
  { resourceId: "fx-res-care-b", profileId: "fx-prof-care-b", displayName: "Fixture Caregiver B", agencyId: AGENCY, skills: ["companionship", "mobility_assistance", "meal_assistance", "escort_to_appointment"], languages: ["en", "hi"], credentialStatus: "verified", membershipStatus: "active" },
  { resourceId: "fx-res-care-c", profileId: "fx-prof-care-c", displayName: "Fixture Caregiver C", agencyId: AGENCY, skills: ["companionship"], languages: ["te"], credentialStatus: "pending", membershipStatus: "invited" },
];

const requests: CareRequest[] = [
  {
    id: "fx-care-req-1",
    reference: "#SCV-BKG-900401",
    providerId: AGENCY_PROVIDER,
    bookingState: "requested",
    taskCodes: ["companionship", "meal_assistance"],
    requestedInterval: { start: "2026-11-22T03:30:00Z", end: "2026-11-22T07:30:00Z" },
    rateSnapshot: { period: "hour", amountPaise: 30000, units: 4, totalPaise: 120000, policyVersion: "fx-policy-v1" },
    servicePin: "999901",
    version: 1,
  },
];

const assignments: CareAssignment[] = [
  {
    id: "fx-care-asg-1",
    requestId: "fx-care-req-0a",
    reference: "#SCV-BKG-900411",
    providerId: AGENCY_PROVIDER,
    agencyId: AGENCY,
    caregiver: { resourceId: "fx-res-care-a", displayName: "Fixture Caregiver A" },
    substate: "assigned",
    taskCodes: ["companionship", "mobility_assistance"],
    interval: { start: "2026-11-20T03:30:00Z", end: "2026-11-20T07:30:00Z" },
    interruption: null,
    version: 2,
  },
  {
    id: "fx-care-asg-2",
    requestId: "fx-care-req-0b",
    reference: "#SCV-BKG-900412",
    providerId: AGENCY_PROVIDER,
    agencyId: AGENCY,
    caregiver: { resourceId: "fx-res-care-b", displayName: "Fixture Caregiver B" },
    substate: "started",
    taskCodes: ["escort_to_appointment"],
    interval: { start: "2026-11-20T02:30:00Z", end: "2026-11-20T05:30:00Z" },
    interruption: null,
    version: 3,
  },
  {
    id: "fx-care-asg-3",
    requestId: "fx-care-req-0c",
    reference: "#SCV-BKG-900413",
    providerId: INDEPENDENT_PROVIDER,
    agencyId: null,
    caregiver: { resourceId: "fx-res-care-indep", displayName: "Fixture Independent Caregiver" },
    substate: "assigned",
    taskCodes: ["companionship"],
    interval: { start: "2026-11-21T03:30:00Z", end: "2026-11-21T05:30:00Z" },
    interruption: null,
    version: 1,
  },
];

const shifts: CareShift[] = [
  { id: "fx-shift-1", assignmentId: "fx-care-asg-1", caregiver: { resourceId: "fx-res-care-a", displayName: "Fixture Caregiver A" }, plannedStart: "2026-11-20T03:30:00Z", plannedEnd: "2026-11-20T07:30:00Z", checkInAt: null, checkOutAt: null, attendance: "scheduled", absence: null, replacement: null, version: 1 },
  { id: "fx-shift-2", assignmentId: "fx-care-asg-2", caregiver: { resourceId: "fx-res-care-b", displayName: "Fixture Caregiver B" }, plannedStart: "2026-11-20T02:30:00Z", plannedEnd: "2026-11-20T05:30:00Z", checkInAt: "2026-11-20T02:31:12Z", checkOutAt: null, attendance: "checked_in", absence: null, replacement: null, version: 2 },
  { id: "fx-shift-3", assignmentId: "fx-care-asg-1", caregiver: { resourceId: "fx-res-care-a", displayName: "Fixture Caregiver A" }, plannedStart: "2026-11-20T03:30:00Z", plannedEnd: "2026-11-20T07:30:00Z", checkInAt: null, checkOutAt: null, attendance: "absent", absence: { reason: "transport_issue", recordedAt: "2026-11-20T03:00:00Z" }, replacement: null, version: 2 },
];

export const careActors = {
  agencyManager: { profileId: "fx-prof-care-manager", providerId: AGENCY_PROVIDER, kind: "agency_manager", agencyId: AGENCY, resourceId: null, membershipStatus: "active" },
  caregiverA: { profileId: "fx-prof-care-a", providerId: AGENCY_PROVIDER, kind: "agency_caregiver", agencyId: AGENCY, resourceId: "fx-res-care-a", membershipStatus: "active" },
  caregiverB: { profileId: "fx-prof-care-b", providerId: AGENCY_PROVIDER, kind: "agency_caregiver", agencyId: AGENCY, resourceId: "fx-res-care-b", membershipStatus: "active" },
  independent: { profileId: "fx-prof-care-indep", providerId: INDEPENDENT_PROVIDER, kind: "independent", agencyId: null, resourceId: "fx-res-care-indep", membershipStatus: "active" },
} as const satisfies Record<string, CareActor>;

export const caretakerFixtures = { ...SYNTHETIC_MARKER, services, staff, requests, assignments, shifts };
