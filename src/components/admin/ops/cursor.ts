/** Upper bound matches the API cursor schema (z.string().max(200)). */
const MAX_CURSOR_LENGTH = 200;
const CURSOR_PATTERN = /^[A-Za-z0-9._~=+/-]+$/;

/**
 * Reads an opaque pagination cursor from a search param. Cursors are server-issued tokens,
 * so anything that is not a short token of URL-safe characters is ignored and the first page loads.
 */
export function readCursor(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) return undefined;
  return CURSOR_PATTERN.test(raw) ? raw : undefined;
}
