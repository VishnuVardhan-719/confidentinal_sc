import type { ActionResult } from "./action-result";
import type { AreaAccess, GuardSession, WorkspaceLoaderContext } from "./access";
import { authorizeOperationsSession, requestedWorkspaceKey } from "./session";
import type { ProviderArea } from "./workspace";

/**
 * Re-authorizes a server action for a provider area. Every action calls this:
 * a page having rendered a button is never treated as permission.
 */
export async function authorizeAreaAction(
  area: ProviderArea,
  decide: (session: GuardSession, workspaceKey: string | null) => AreaAccess,
): Promise<{ ok: true; ctx: WorkspaceLoaderContext } | { ok: false; result: ActionResult }> {
  const [{ guard }, key] = await Promise.all([authorizeOperationsSession(area), requestedWorkspaceKey(area)]);
  const access = decide(guard, key);
  if (access.kind === "allowed") return { ok: true, ctx: { workspace: access.workspace } };
  if (access.kind === "unauthenticated") return { ok: false, result: { ok: false, code: "unauthenticated" } };
  return { ok: false, result: { ok: false, code: "forbidden" } };
}

/** Bound action arguments travel through the browser unencrypted: always re-validate them. */
export const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
export const isVersion = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v < 2_147_483_647;
export const isKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);
