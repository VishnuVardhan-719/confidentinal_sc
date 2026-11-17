import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/components/ui/form-field";
import {
  cityOf,
  dateOfBirthSchema,
  displayNameOf,
  parseSignupRole,
  rupeesToPaise,
  signupDetailsSchema,
} from "@/lib/validation/auth-signup";

const patient = {
  role: "patient", fullName: "Test Patient", phone: "98765 43210", email: "T@Example.com", dateOfBirth: "1990-04-12",
  city: "Hyderabad", preferredLanguage: "te", emergencyContactName: "", emergencyContactPhone: "",
};
const doctor = {
  role: "doctor", fullName: "Test Doctor", speciality: "General Physician", registrationNumber: "tsmc/12345",
  yearsExperience: "12", clinicCity: "Hyderabad", consultationModes: ["video", "clinic", "video"], languages: ["English"], feePaise: "450.50",
};
const lab = {
  role: "lab", labName: "Test Lab", licenceNumber: "LAB-2026-01", city: "Chennai", services: ["home_collection"],
  opensAt: "07:00", closesAt: "19:30", contactName: "Test Contact", contactPhone: "+91 91234 56789",
};
const ambulance = {
  role: "ambulance", operatorName: "Test Transport", registrationNumber: "TS09 AB 1234", vehicleCount: "3", baseCity: "Hyderabad",
  vehicleType: "bls", scheduledOnly: true, contactPhone: "9123456789",
};
const caretaker = {
  role: "caretaker", fullName: "Test Caretaker", phone: "8123456789", city: "Vijayawada", yearsExperience: "4",
  languages: ["Telugu", "Hindi"], patientLinkCode: "ab12-cd34",
};

const errorsOf = (input: unknown) => {
  const r = signupDetailsSchema.safeParse(input);
  return r.success ? {} : fieldErrors(r.error);
};

describe("money in paise", () => {
  it.each([
    ["500", 50000], ["1,200", 120000], ["450.5", 45050], ["450.50", 45050], ["0.99", 99], [" 75 ", 7500],
  ])("%j rupees is %i paise", (input, paise) => {
    expect(rupeesToPaise(input)).toBe(paise);
  });
  it.each(["", "abc", "1.234", "-5", "1e3", "₹500", "12345678"])("rejects %j", (v) => {
    expect(rupeesToPaise(v)).toBeNull();
  });
  it("stores the doctor's fee as an integer paise value", () => {
    const r = signupDetailsSchema.parse(doctor);
    expect(r.role === "doctor" && r.feePaise).toBe(45050);
    expect(Number.isInteger(r.role === "doctor" ? r.feePaise : NaN)).toBe(true);
  });
  it("bounds the fee to ₹1 – ₹1,00,000", () => {
    expect(errorsOf({ ...doctor, feePaise: "0.50" }).feePaise).toBe("The fee must be at least ₹1");
    expect(errorsOf({ ...doctor, feePaise: "100000.01" }).feePaise).toBe("The fee must be ₹1,00,000 or less");
    expect(errorsOf({ ...doctor, feePaise: "five hundred" }).feePaise).toMatch(/amount in rupees/);
  });
});

describe("per-role details", () => {
  it("accepts a complete patient and normalises phone and email", () => {
    const r = signupDetailsSchema.parse(patient);
    expect(r).toMatchObject({ role: "patient", phone: "+919876543210", email: "t@example.com" });
    expect(r.role === "patient" && r.emergencyContactPhone).toBeUndefined();
  });
  it("needs both halves of an emergency contact", () => {
    expect(errorsOf({ ...patient, emergencyContactName: "Someone" }).emergencyContactPhone).toMatch(/mobile number/);
    expect(errorsOf({ ...patient, emergencyContactPhone: "9876543210" }).emergencyContactName).toMatch(/name/);
    expect(errorsOf({ ...patient, emergencyContactName: "Someone", emergencyContactPhone: "9876543210" })).toEqual({});
  });
  it("accepts a doctor, upper-cases the registration and de-duplicates modes", () => {
    const r = signupDetailsSchema.parse(doctor);
    expect(r).toMatchObject({ registrationNumber: "TSMC/12345", consultationModes: ["video", "clinic"], yearsExperience: 12 });
  });
  it("doctor needs at least one mode and one language", () => {
    const e = errorsOf({ ...doctor, consultationModes: [], languages: [] });
    expect(e.consultationModes).toBe("Choose at least one way to consult");
    expect(e.languages).toBe("Choose at least one language");
  });
  it("accepts a lab and requires closing after opening", () => {
    expect(errorsOf(lab)).toEqual({});
    expect(errorsOf({ ...lab, closesAt: "06:00" }).closesAt).toBe("Closing time must be after opening time");
  });
  it("ambulance must confirm scheduled, non-emergency only", () => {
    expect(errorsOf(ambulance)).toEqual({});
    expect(errorsOf({ ...ambulance, scheduledOnly: false }).scheduledOnly).toMatch(/scheduled, non-emergency transfers only/);
    expect(errorsOf({ ...ambulance, vehicleCount: "0" }).vehicleCount).toBe("Must be at least 1");
    expect(errorsOf({ ...ambulance, vehicleType: "helicopter" }).vehicleType).toBe("Choose a vehicle type");
  });
  it("caretaker link code is optional and normalised", () => {
    expect(signupDetailsSchema.parse(caretaker)).toMatchObject({ patientLinkCode: "AB12CD34" });
    expect(signupDetailsSchema.parse({ ...caretaker, patientLinkCode: "" })).not.toHaveProperty("patientLinkCode", expect.anything());
    expect(errorsOf({ ...caretaker, patientLinkCode: "x!" }).patientLinkCode).toMatch(/6 to 12/);
  });
  it("rejects admin and unknown roles outright", () => {
    for (const role of ["admin", "Admin", "", "superuser"]) {
      expect(signupDetailsSchema.safeParse({ ...patient, role }).success).toBe(false);
      expect(parseSignupRole(role)).toBeNull();
    }
    expect(parseSignupRole("doctor")).toBe("doctor");
  });
  it("reports every missing field by path", () => {
    expect(Object.keys(errorsOf({ role: "lab", labName: "", licenceNumber: "", city: "", services: [], opensAt: "", closesAt: "", contactName: "", contactPhone: "" })).sort())
      .toEqual(["city", "closesAt", "contactName", "contactPhone", "labName", "licenceNumber", "opensAt", "services"]);
  });
  it("derives a display name and city for every role", () => {
    const parsed = [patient, doctor, lab, ambulance, caretaker].map((x) => signupDetailsSchema.parse(x));
    expect(parsed.map(displayNameOf)).toEqual(["Test Patient", "Test Doctor", "Test Lab", "Test Transport", "Test Caretaker"]);
    expect(parsed.map(cityOf)).toEqual(["Hyderabad", "Hyderabad", "Chennai", "Hyderabad", "Vijayawada"]);
  });
});

describe("date of birth", () => {
  const dob = dateOfBirthSchema(() => new Date("2026-11-17T12:00:00Z"));
  it.each(["1990-04-12", "2026-11-17", "1908-01-01"])("accepts %s", (v) => expect(dob.safeParse(v).success).toBe(true));
  it.each([
    ["", "Enter your date of birth"],
    ["12/04/1990", "Enter the date as day, month and year"],
    ["1990-02-30", "That date does not exist"],
    ["2026-11-18", "Date of birth cannot be in the future"],
    ["1890-01-01", "Check the year"],
  ])("rejects %j", (v, message) => {
    const r = dob.safeParse(v);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe(message);
  });
});
