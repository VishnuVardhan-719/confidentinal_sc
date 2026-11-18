import type { DoctorResult } from "@/modules/providers/doctor-search";

/** Fictional development doctors. Names are labels; nothing here describes a real person, clinic, rating or coverage.
 * Coordinates are synthetic points used only to exercise distance sorting in fixture mode. */
export type SyntheticDoctor = Omit<DoctorResult, "distanceKm" | "nextSlotAt"> & { point: { lat: number; lng: number } | null; nextSlotOffsetHours: number | null };

const base = { photoUrl: null, rating: null, unit: "visit" as const, synthetic: true };
export const SYNTHETIC_DOCTORS: readonly SyntheticDoctor[] = [
  { ...base, providerId: "00000000-0000-4000-8000-000000000001", serviceId: "00000000-0000-4000-8001-000000000001", displayName: "Synthetic doctor 1",
    specialities: ["general_physician"], degrees: ["MBBS"], experienceYears: 9, languages: ["en", "te", "hi"], gender: "female", modes: ["home_visit"],
    feePaise: 50000, openSlots: 6, nextSlotOffsetHours: 3, clinicName: null, location: { locality: "Synthetic locality A", city: "Hyderabad", pin: "500001" }, point: { lat: 17.3850, lng: 78.4867 } },
  { ...base, providerId: "00000000-0000-4000-8000-000000000101", serviceId: "00000000-0000-4000-8001-000000000101", displayName: "Synthetic doctor 2",
    specialities: ["paediatrics"], degrees: ["MBBS", "MD"], experienceYears: 14, languages: ["en", "te"], gender: "male", modes: ["home_visit", "clinic"],
    feePaise: 80000, openSlots: 2, nextSlotOffsetHours: 26, clinicName: "Synthetic clinic North", location: { locality: "Synthetic locality B", city: "Hyderabad", pin: "500032" }, point: { lat: 17.4400, lng: 78.3489 } },
  { ...base, providerId: "00000000-0000-4000-8000-000000000102", serviceId: "00000000-0000-4000-8001-000000000102", displayName: "Synthetic doctor 3",
    specialities: ["geriatrics", "internal_medicine"], degrees: ["MBBS", "MD"], experienceYears: 21, languages: ["en", "hi", "ur"], gender: "female", modes: ["home_visit"],
    feePaise: 120000, openSlots: 0, nextSlotOffsetHours: null, clinicName: null, location: { locality: "Synthetic locality C", city: "Hyderabad", pin: "500081" }, point: { lat: 17.4483, lng: 78.3915 } },
  { ...base, providerId: "00000000-0000-4000-8000-000000000103", serviceId: "00000000-0000-4000-8001-000000000103", displayName: "Synthetic doctor 4",
    specialities: ["physiotherapy"], degrees: ["BPT"], experienceYears: 5, languages: ["en", "te"], gender: "male", modes: ["home_visit"],
    feePaise: 60000, openSlots: 9, nextSlotOffsetHours: 50, clinicName: "Synthetic physio centre", location: { locality: "Synthetic locality D", city: "Secunderabad", pin: "500003" }, point: { lat: 17.4399, lng: 78.4983 } },
  { ...base, providerId: "00000000-0000-4000-8000-000000000104", serviceId: "00000000-0000-4000-8001-000000000104", displayName: "Synthetic doctor 5",
    specialities: ["dermatology"], degrees: ["MBBS", "DVL"], experienceYears: 11, languages: ["en", "hi"], gender: "other", modes: ["clinic", "video"],
    feePaise: 90000, openSlots: 4, nextSlotOffsetHours: 5, clinicName: "Synthetic skin clinic", location: { locality: "Synthetic locality E", city: "Hyderabad", pin: "500034" }, point: { lat: 17.4126, lng: 78.4392 } },
  { ...base, providerId: "00000000-0000-4000-8000-000000000105", serviceId: "00000000-0000-4000-8001-000000000105", displayName: "Synthetic doctor 6",
    specialities: ["general_physician", "diabetology"], degrees: ["MBBS"], experienceYears: 3, languages: ["te", "kn"], gender: "male", modes: ["home_visit"],
    feePaise: 40000, openSlots: 1, nextSlotOffsetHours: 120, clinicName: null, location: null, point: null },
];
