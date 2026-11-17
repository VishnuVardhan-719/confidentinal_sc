import { z } from "zod";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { command, IdentityError } from "@/lib/auth/identity";
import { organizationCreateSchema } from "@/lib/validation/identity";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const { data, error } = await db.from("organizations").select("id,name,version").order("id").limit(100);
    if (error) throw new IdentityError(500, "identity_unavailable");
    return json({ organizations: data });
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
