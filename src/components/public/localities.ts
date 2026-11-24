import { toAsciiDigits } from "@/components/shared/input-format";

/**
 * Well-known Hyderabad and Secunderabad localities with their main PIN code, so a visitor can say
 * "Madhapur" instead of knowing a PIN. Coverage is still decided by PIN on the server: this list only
 * turns a name into the PIN the directories already understand. It is a convenience hint, not a
 * coverage claim; the backend PIN directory replaces it when that lands.
 */
export const LOCALITIES = [
  { name: "Abids", pin: "500001" },
  { name: "Nampally", pin: "500001" },
  { name: "Charminar", pin: "500002" },
  { name: "Secunderabad", pin: "500003" },
  { name: "Khairatabad", pin: "500004" },
  { name: "Habsiguda", pin: "500007" },
  { name: "Tolichowki", pin: "500008" },
  { name: "Alwal", pin: "500010" },
  { name: "Bowenpally", pin: "500011" },
  { name: "Begumpet", pin: "500016" },
  { name: "Ameerpet", pin: "500016" },
  { name: "Tarnaka", pin: "500017" },
  { name: "Moosapet", pin: "500018" },
  { name: "Erragadda", pin: "500018" },
  { name: "Lingampally", pin: "500019" },
  { name: "Mehdipatnam", pin: "500028" },
  { name: "Himayatnagar", pin: "500029" },
  { name: "Gachibowli", pin: "500032" },
  { name: "Jubilee Hills", pin: "500033" },
  { name: "Banjara Hills", pin: "500034" },
  { name: "Kothapet", pin: "500035" },
  { name: "SR Nagar", pin: "500038" },
  { name: "Uppal", pin: "500039" },
  { name: "Yousufguda", pin: "500045" },
  { name: "Malkajgiri", pin: "500047" },
  { name: "Attapur", pin: "500048" },
  { name: "Miyapur", pin: "500049" },
  { name: "Chandanagar", pin: "500050" },
  { name: "Nagole", pin: "500068" },
  { name: "Kukatpally", pin: "500072" },
  { name: "LB Nagar", pin: "500074" },
  { name: "Narsingi", pin: "500075" },
  { name: "Mallapur", pin: "500076" },
  { name: "Madhapur", pin: "500081" },
  { name: "Hitech City", pin: "500081" },
  { name: "Panjagutta", pin: "500082" },
  { name: "Somajiguda", pin: "500082" },
  { name: "Kondapur", pin: "500084" },
  { name: "Manikonda", pin: "500089" },
  { name: "Nizampet", pin: "500090" },
  { name: "Sainikpuri", pin: "500094" },
  { name: "Koti", pin: "500095" },
  { name: "Film Nagar", pin: "500096" },
  { name: "Dilsukhnagar", pin: "500060" },
] as const;

/** Indian PIN shape: 6 digits, first digit 1-9. Shape only; the server decides whether it is served. */
const PIN_RE = /^[1-9][0-9]{5}$/;

const fold = (value: string) =>
  value.normalize("NFC").toLowerCase().replace(/\./g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const byName = (name: string) => LOCALITIES.find((l) => l.name === name)!;
const BY_NAME = new Map<string, (typeof LOCALITIES)[number]>([
  ...LOCALITIES.map((l) => [fold(l.name), l] as const),
  ["hitec city", byName("Hitech City")] as const,
]);

export type ResolvedLocation = { pin: string; label: string };

/** A 6-digit PIN or a known locality name -> the PIN to search with. Null when it is neither. */
export function resolveLocation(raw: string | null | undefined): ResolvedLocation | null {
  const typed = (raw ?? "").trim();
  if (!typed) return null;
  // Only digits (any script), spaces and hyphens count as a PIN; "Atlantis 500081" is not one.
  if (/^[\p{Nd}\s-]+$/u.test(typed)) {
    const digits = toAsciiDigits(typed);
    return PIN_RE.test(digits) ? { pin: digits, label: digits } : null;
  }
  const hit = BY_NAME.get(fold(typed));
  return hit ? { pin: hit.pin, label: hit.name } : null;
}
