import { cookies } from "next/headers";
import { createHttpClient, serverApiOrigin, type HttpClient } from "@/lib/api/http";
import { readAccessToken } from "./session-cookie";

/**
 * Server-only. The backend authenticates `/api/*` by `Authorization: Bearer <access token>` and ignores
 * cookies, so adapters that call it from a server component or action read the token from the httpOnly
 * session cookie per request. Never log the result.
 */
export async function sessionAccessToken(): Promise<string | null> {
  try {
    return readAccessToken(await cookies());
  } catch {
    return null; // outside a request scope: no session
  }
}

/** Headers for `modules/admin/http-util` (empty when signed out, so the call returns 401 -> unauthenticated). */
export async function sessionBearerHeaders(): Promise<Record<string, string>> {
  const token = await sessionAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Shared HTTP client for adapters that need the signed-in user (bookings). Origin from APP_ORIGIN only. */
export function createSessionHttpClient(env: Record<string, string | undefined> = process.env): HttpClient {
  const baseUrl = serverApiOrigin(env);
  return createHttpClient({ ...(baseUrl ? { baseUrl } : {}), getAccessToken: sessionAccessToken });
}
