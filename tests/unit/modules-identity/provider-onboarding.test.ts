import { describe, expect, it } from "vitest";
import {
  ambulanceSectionSchemas,
  caretakerSectionSchemas,
  doctorSectionSchemas,
  labSectionSchemas,
  PROVIDER_STEPS,
  providerCompletion,
  providerSectionSchema,
} from "@/modules/onboarding/provider";
import { weeklyHoursSchema } from "@/modules/onboarding/shared";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hours = [{ day: "mon", opens: "09:00", closes: "13:00" }];

const doctor = {
  listing: { displayName: "Synthetic Doctor", description: "" },
  identity: {
    registrationNumber: "SYN-12345",
    issuingAuthority: "Synthetic Medical Council",
    qualifications: [{ degree: "MBBS" }],
    specialty: "General medicine",
    experienceYears: 5,
    languages: ["en", "te"],
    city: "Synthetic City",
    photoAssetId: ID(1),
  },
  practice: {
    homeVisitFeePaise: 80_000,
    servicePins: ["500001"],
    travelRadiusKm: 10,
    startingPoint: { pinCode: "500001", locality: "Synthetic locality" },
  },
  availability: { weeklyHours: hours },
  documents: { documents: [{ kind: "registration", documentId: ID(2) }] },
};

describe("doctor onboarding", () => {
  it("accepts a complete synthetic draft and reports ready", () => {
    for (const [id, value] of Object.entries(doctor)) {
      expect(providerSectionSchema("doctor", id)?.safeParse(value).success, id).toBe(true);
    }
    const c = providerCompletion("doctor", doctor);
    expect(c.readyToSubmit).toBe(true);
    expect(c.requiredTotal).toBe(5);
  });

  it("rejects decimal rupee fees, missing registration evidence and unknown sections", () => {
    expect(doctorSectionSchemas.practice.safeParse({ ...doctor.practice, homeVisitFeePaise: 800.5 }).success).toBe(false);
    expect(doctorSectionSchemas.practice.safeParse({ ...doctor.practice, homeVisitFeePaise: 0 }).success).toBe(false);
    const idOnly = { documents: [{ kind: "identity", documentId: ID(3) }] };
    const r = doctorSectionSchemas.documents.safeParse(idOnly);
    expect(r.success).toBe(false);
    expect(providerSectionSchema("doctor", "verificationState")).toBeNull();
    expect(providerSectionSchema("doctor", "__proto__")).toBeNull();
  });

  it("highlights missing required sections instead of a percent", () => {
    const c = providerCompletion("doctor", { listing: doctor.listing });
    expect(c.readyToSubmit).toBe(false);
    expect(c.missingRequired).toEqual(["identity", "practice", "availability", "documents"]);
    expect(c.nextStep).toBe("identity");
  });

  it("step list keeps review as navigation-only", () => {
    expect(PROVIDER_STEPS.doctor.at(-1)?.id).toBe("review");
    expect(providerCompletion("doctor", doctor).steps.map((s) => s.id)).not.toContain("review");
  });
});

describe("lab onboarding", () => {
  it("staff is optional for activation; licence evidence is required", () => {
    const lab = {
      listing: { displayName: "Synthetic Lab" },
      organization: { ownership: "organization", legalName: "Synthetic Lab Pvt", brandName: "Synthetic Lab", managerName: "Synthetic Manager", managerPhone: "+916000000000" },
      branches: { branches: [{ label: "Main", addressLine1: "1 Placeholder Road", city: "Synthetic City", state: "Telangana", pinCode: "500001", weeklyHours: hours }] },
      credentials: { registrationNumber: "LAB-001" },
      catalog: { tests: [{ name: "Synthetic panel", pricePaise: 50_000, homeCollection: true }] },
      coverage: { homeCollectionPins: ["500001"] },
      documents: { documents: [{ kind: "licence", documentId: ID(4) }] },
    };
    expect(providerCompletion("lab", lab).readyToSubmit).toBe(true);
    expect(labSectionSchemas.coverage.safeParse({ homeCollectionPins: ["500001", "500001"] }).success).toBe(false);
    expect(labSectionSchemas.documents.safeParse({ documents: [{ kind: "registration", documentId: ID(5) }] }).success).toBe(false);
  });
});

describe("ambulance onboarding", () => {
  it("allows scheduled transport only", () => {
    const operator = { ownership: "company", operatorName: "Synthetic Transport", contactPhone: "+916000000000", baseCity: "Synthetic City", basePinCode: "500001", serviceMode: "scheduled" };
    expect(ambulanceSectionSchemas.operator.safeParse(operator).success).toBe(true);
    expect(ambulanceSectionSchemas.operator.safeParse({ ...operator, serviceMode: "emergency" }).success).toBe(false);
  });

  it("requires a permit document per vehicle and rejects verified-class injection", () => {
    const vehicle = { registrationNumber: "TS 09 AB 1234", requestedClass: "bls", permitDocumentId: ID(6) };
    expect(ambulanceSectionSchemas.fleet.safeParse({ vehicles: [vehicle] }).success).toBe(true);
    expect(ambulanceSectionSchemas.fleet.safeParse({ vehicles: [{ ...vehicle, permitDocumentId: undefined }] }).success).toBe(false);
    expect(ambulanceSectionSchemas.fleet.safeParse({ vehicles: [{ ...vehicle, verifiedClass: "als" }] }).success).toBe(false);
  });
});

describe("caretaker onboarding", () => {
  it("blocks clinical nursing tasks without a nursing credential", () => {
    expect(caretakerSectionSchemas.skills.safeParse({ tasks: ["companionship"] }).success).toBe(true);
    const clinical = caretakerSectionSchemas.skills.safeParse({ tasks: ["companionship", "wound_dressing"] });
    expect(clinical.success).toBe(false);
    expect(
      caretakerSectionSchemas.skills.safeParse({
        tasks: ["wound_dressing"],
        nursingCredential: { registrationNumber: "NUR-001", documentId: ID(7) },
      }).success,
    ).toBe(true);
  });

  it("requires agency name for agencies and unique pricing periods", () => {
    const identity = { ownership: "agency", fullName: "Synthetic Caregiver", photoAssetId: ID(8), languages: ["hi"], experienceYears: 2 };
    expect(caretakerSectionSchemas.identity.safeParse(identity).success).toBe(false);
    expect(caretakerSectionSchemas.identity.safeParse({ ...identity, agencyName: "Synthetic Care Agency" }).success).toBe(true);
    const rates = [{ period: "hour", amountPaise: 20_000 }, { period: "hour", amountPaise: 25_000 }];
    expect(caretakerSectionSchemas.pricing.safeParse({ rates }).success).toBe(false);
  });
});

describe("weekly hours", () => {
  it("rejects reversed and overlapping windows", () => {
    expect(weeklyHoursSchema.safeParse([{ day: "mon", opens: "13:00", closes: "09:00" }]).success).toBe(false);
    expect(
      weeklyHoursSchema.safeParse([
        { day: "mon", opens: "09:00", closes: "12:00" },
        { day: "mon", opens: "11:00", closes: "14:00" },
      ]).success,
    ).toBe(false);
    expect(
      weeklyHoursSchema.safeParse([
        { day: "mon", opens: "09:00", closes: "12:00" },
        { day: "mon", opens: "12:00", closes: "14:00" },
        { day: "tue", opens: "09:00", closes: "12:00" },
      ]).success,
    ).toBe(true);
  });
});
