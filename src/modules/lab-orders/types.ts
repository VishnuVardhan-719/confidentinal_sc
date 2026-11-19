import type { BaseProvider, ServiceRequest } from "@/modules/service-requests/core";

/** Patient-side lab orders: home sample collection for one or more tests from one lab. */
export type LabSpecimen = "blood" | "urine";
export type LabPreparation = "fasting_10h" | "morning_sample" | "none";
export type LabTest = { id: string; name: string; specimen: LabSpecimen; preparation: LabPreparation; pricePaise: number; reportHours: number };
export type LabCollectionOption = "home" | "walk_in";
export type LabProvider = BaseProvider & { category: "lab"; collectionFeePaise: number; collectionOptions: LabCollectionOption[]; tests: LabTest[] };
export type LabOrderDetails = { collection: "home"; tests: Pick<LabTest, "id" | "name" | "specimen" | "preparation">[] };
export type LabOrder = ServiceRequest<LabOrderDetails>;
