import type { routing } from "./routing";
import type common from "../messages/en/common.json";
import type publicMessages from "../messages/en/public.json";
import type auth from "../messages/en/auth.json";
import type onboarding from "../messages/en/onboarding.json";
import type patient from "../messages/en/patient.json";
import type patientAccount from "../messages/en/patientAccount.json";
import type doctor from "../messages/en/doctor.json";
import type lab from "../messages/en/lab.json";
import type ambulance from "../messages/en/ambulance.json";
import type caretaker from "../messages/en/caretaker.json";
import type admin from "../messages/en/admin.json";
import type booking from "../messages/en/booking.json";
import type clinical from "../messages/en/clinical.json";
import type payment from "../messages/en/payment.json";
import type support from "../messages/en/support.json";
import type errors from "../messages/en/errors.json";
import type accessibility from "../messages/en/accessibility.json";
import type services from "../messages/en/services.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: {
      common: typeof common;
      public: typeof publicMessages;
      auth: typeof auth;
      onboarding: typeof onboarding;
      patient: typeof patient;
      patientAccount: typeof patientAccount;
      doctor: typeof doctor;
      lab: typeof lab;
      ambulance: typeof ambulance;
      caretaker: typeof caretaker;
      admin: typeof admin;
      booking: typeof booking;
      clinical: typeof clinical;
      payment: typeof payment;
      support: typeof support;
      errors: typeof errors;
      accessibility: typeof accessibility;
      services: typeof services;
    };
  }
}
