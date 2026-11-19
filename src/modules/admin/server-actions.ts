"use server";

import { cookies } from "next/headers";
import type { ActionResult } from "./action-result";
import { authorizeOperationsSession } from "./session";
import { switchWorkspace, type ProviderArea } from "./workspace";

const AREAS: readonly ProviderArea[] = ["lab", "ambulance", "caretaker"];

/**
 * Switch the active workspace for an area. Only an active membership of the
 * signed-in person is accepted. The caller must refresh; switching invalidates
 * every previously loaded screen.
 */
export async function switchWorkspaceAction(area: unknown, key: unknown): Promise<ActionResult> {
  if (typeof area !== "string" || !(AREAS as readonly string[]).includes(area)) return { ok: false, code: "validation" };
  const { guard } = await authorizeOperationsSession(area as ProviderArea);
  if (!guard) return { ok: false, code: "unauthenticated" };
  const own = guard.memberships.filter((m) => m.profileId === guard.profileId);
  const result = switchWorkspace(own, area as ProviderArea, key);
  if (!result.ok) return { ok: false, code: "forbidden" };
  const store = await cookies();
  store.set(result.cookie.name, result.cookie.value, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 30 });
  return { ok: true };
}
