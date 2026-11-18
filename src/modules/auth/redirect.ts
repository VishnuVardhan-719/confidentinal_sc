const INTERNAL_BASE = "https://internal.invalid";
const MAX_REDIRECT_LENGTH = 2048;

/**
 * Returns `target` only if it is an internal, same-origin path; otherwise `fallback`.
 * Rejects absolute/protocol-relative URLs, backslashes, control characters, `/api/*`
 * and anything that resolves outside our origin. The result is the normalized path.
 */
export function safeRedirect(target: unknown, fallback: string): string {
  const normalized = normalizeInternalPath(target);
  return normalized ?? fallback;
}

/** Normalized internal path (pathname + search + hash) or null if not provably internal. */
export function normalizeInternalPath(target: unknown): string | null {
  if (typeof target !== "string") return null;
  if (target.length === 0 || target.length > MAX_REDIRECT_LENGTH) return null;
  if (!target.startsWith("/")) return null;
  // Protocol-relative ("//host") and backslash tricks ("/\\host", "\\\\host").
  if (target.startsWith("//") || target.includes("\\")) return null;
  // Control characters, including tab/newline which URL parsers strip.
  if (hasControlCharacter(target)) return null;
  let url: URL;
  try {
    url = new URL(target, INTERNAL_BASE);
  } catch {
    return null;
  }
  if (url.origin !== INTERNAL_BASE) return null;
  // Encoded slashes/backslashes can be decoded by downstream routers into "//host".
  if (/%2f|%5c/i.test(url.pathname)) return null;
  if (url.pathname.startsWith("//")) return null;
  const lower = url.pathname.toLowerCase();
  if (lower === "/api" || lower.startsWith("/api/")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}
