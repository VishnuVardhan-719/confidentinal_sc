import { isLocale, type Locale } from "./roles";
import { DEFAULT_LOCALE } from "./routes";

/** Safe FormData readers for server actions. Files are ignored; strings are length-bounded. */

export function formString(fd: FormData, name: string, max = 512): string | undefined {
  const value = fd.get(name);
  if (typeof value !== "string") return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

export function formTrimmed(fd: FormData, name: string, max = 512): string | undefined {
  const value = formString(fd, name, max)?.trim();
  return value ? value : undefined;
}

export const formChecked = (fd: FormData, name: string): boolean => {
  const value = fd.get(name);
  return value === "on" || value === "true" || value === "1";
};

export function formLocale(fd: FormData): Locale {
  const value = formString(fd, "locale", 8);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function formInt(fd: FormData, name: string): number | undefined {
  const value = formTrimmed(fd, name, 12);
  if (value === undefined || !/^-?\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
}
