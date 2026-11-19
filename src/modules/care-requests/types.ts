import type { BaseProvider, ServiceRequest } from "@/modules/service-requests/core";

/** Patient-side caretaker requests: one non-clinical home care shift from an independent caretaker or an agency. */
export const CARE_TASKS = ["companionship", "mobility_help", "meal_help", "personal_care", "medicine_reminder"] as const;
export type CareTask = (typeof CARE_TASKS)[number];
export type CareProvider = BaseProvider & {
  category: "caretaker"; kind: "independent" | "agency"; languages: ("en" | "te" | "hi")[];
  tasks: CareTask[]; hourlyRatePaise: number; minHours: number; maxHours: number;
};
export type CareRequestDetails = { kind: CareProvider["kind"]; tasks: CareTask[]; hours: number };
export type CareRequest = ServiceRequest<CareRequestDetails>;
