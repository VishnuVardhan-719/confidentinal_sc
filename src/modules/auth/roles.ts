import { z } from "zod";

/** Every workspace role the product knows. Authorization is server-derived; this list only types view models. */
export const ROLES = ["patient", "doctor", "lab", "ambulance", "caretaker", "admin"] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

/** Roles a visitor may pick at signup. Admin is invite-only and never self-selected. */
export const SIGNUP_ROLES = ["patient", "doctor", "lab", "ambulance", "caretaker"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];
export const signupRoleSchema = z.enum(SIGNUP_ROLES);

/** Provider categories (matches I01/I02 `providers.category`). */
export const PROVIDER_CATEGORIES = ["doctor", "lab", "ambulance", "caretaker"] as const;
export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];
export const providerCategorySchema = z.enum(PROVIDER_CATEGORIES);

export const LOCALES = ["en", "te", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const localeSchema = z.enum(LOCALES);

export const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (ROLES as readonly string[]).includes(value);

export const isProviderCategory = (value: unknown): value is ProviderCategory =>
  typeof value === "string" && (PROVIDER_CATEGORIES as readonly string[]).includes(value);

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);
