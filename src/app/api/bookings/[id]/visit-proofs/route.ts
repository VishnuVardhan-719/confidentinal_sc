import { connection } from "next/server";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";
import { proofIssueSchema } from "@/lib/validation/doctor-extras";

type Context = { params: Promise<{ id: string }> };
type Issued = { token_id: string; token: string | null; expires_at: string };

// DC12: the patient's proofs for one completed doctor visit (ids, times, status; never a token).
export async function GET(request: Request, context: Context) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    return json({ proofs: await dcxCommand(db, "list_visit_proofs", { p_booking_id: await routeId(context) }) });
  });
}

// DC12: issues one opaque token. The plaintext is shown once; the QR should encode
// https://surecurevisit.in/proof#<token> so the token stays in the URL fragment.
export async function POST(request: Request, context: Context) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, proofIssueSchema);
    const issued = await dcxCommand(db, "issue_visit_proof", { p_booking_id: id, p_ttl_hours: v.ttlHours, p_request_key: key }) as Issued;
    // A replayed key cannot return the plaintext again (only its hash is stored).
    if (!issued.token) return json({ error: { code: "proof_already_issued" }, tokenId: issued.token_id }, 409);
    return json({ proof: { tokenId: issued.token_id, token: issued.token, expiresAt: issued.expires_at } });
  });
}
