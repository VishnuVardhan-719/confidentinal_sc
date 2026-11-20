import { connection } from "next/server";
import { endpoint, input, json } from "@/lib/auth/http";
import { dcxCommand } from "@/lib/doctor-extras/service";
import { publicAuthClient } from "@/lib/db/request-client";
import { proofVerifySchema } from "@/lib/validation/doctor-extras";

type Check = { valid: boolean; visit_date?: string; service?: string };

// DC12 guest check: no session. The token travels in the body (never in a URL that a server
// would log). Answers only valid/invalid, the visit date and the service kind.
export async function POST(request: Request) {
  return endpoint(async () => {
    await connection();
    const v = await input(request, proofVerifySchema);
    const r = await dcxCommand(publicAuthClient(), "verify_visit_proof", { p_token: v.token }) as Check;
    return json(r.valid ? { valid: true, visitDate: r.visit_date, service: r.service } : { valid: false });
  });
}
