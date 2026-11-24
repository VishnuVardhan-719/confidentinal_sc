/**
 * Browser storage for a visitor who has already answered the first-visit "Where do you need care?"
 * prompt. Without it every fresh Playwright context would open on that dialog and cover the page
 * under test. The prompt's own spec starts from empty storage instead (location-prompt.spec.ts).
 */
export const LOCATION_KEY = "scv.location.v1";

export function locationAnswered(origin: string) {
  return {
    cookies: [],
    origins: [{ origin, localStorage: [{ name: LOCATION_KEY, value: JSON.stringify({ v: 1, skipped: true }) }] }],
  };
}
