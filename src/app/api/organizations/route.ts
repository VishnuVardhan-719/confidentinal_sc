import { listQuery } from "@/lib/auth/pagination";
import { z } from "zod";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { command, IdentityError } from "@/lib/auth/identity";
import { organizationCreateSchema } from "@/lib/validation/identity";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const { limit, cursor } = listQuery(request);
    return json(await command(db, "list_organizations", { p_limit: limit, p_cursor: cursor ?? null }));
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const key = z.uuid().safeParse(request.headers.get("idempotency-key"));
    if (!key.success) throw new IdentityError(422, "invalid_idempotency_key");
    const value = await input(request, organizationCreateSchema);
    return json({ organizationId: await command(db, "create_organization", { p_name: value.name, p_request_key: key.data }) });
  });
}
