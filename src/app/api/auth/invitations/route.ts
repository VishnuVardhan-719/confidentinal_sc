import { endpoint, json, session } from "@/lib/auth/http";
import { command } from "@/lib/auth/identity";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    return json({ invitations: await command(db, "list_organization_invites", {}) });
  });
}
