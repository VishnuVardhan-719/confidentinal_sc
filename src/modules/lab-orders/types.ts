import type { BaseProvider, ServiceRequest } from "@/modules/service-requests/core";

/** Patient-side lab orders: home sample collection for one or more tests from one lab. */
export type LabSpecimen = "blood" | "urine";
export type LabPreparation = "fasting_10h" | "morning_sample" | "none";
export type LabTest = { id: string; name: string; specimen: LabSpecimen; preparation: LabPreparation; pricePaise: number; reportHours: number };
export type LabProvider = BaseProvider & { category: "lab"; collectionFeePaise: number; tests: LabTest[] };
export type LabOrderDetails = { collection: "home"; tests: Pick<LabTest, "id" | "name" | "specimen" | "preparation">[] };
export type LabOrder = ServiceRequest<LabOrderDetails>;
