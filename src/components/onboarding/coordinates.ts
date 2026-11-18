/** "17.5294, 78.3946 (±137 m)". Pure, usable from server and client components. */
export function formatCoordinates(lat: number, lng: number, accuracyM: number | null): string {
  const base = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  return accuracyM && accuracyM > 0 ? `${base} (±${Math.round(accuracyM)} m)` : base;
}
