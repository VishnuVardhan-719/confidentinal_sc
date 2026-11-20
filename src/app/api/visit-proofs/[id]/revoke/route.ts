import { endpoint, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";

// DC12: revocation is never gated; repeating it returns the same row.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    return json({ proof: await dcxCommand(db, "revoke_visit_proof", { p_token_id: id, p_request_key: key }) });
  });
}
