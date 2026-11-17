import { endpoint, json, session } from "@/lib/auth/http";
import { command } from "@/lib/auth/identity";
import { listQuery } from "@/lib/auth/pagination";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const { limit, cursor } = listQuery(request);
    return json(await command(db, "list_organization_invites_page", { p_limit: limit, p_cursor: cursor ?? null }));
  });
}
