import { connection } from "next/server";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";
import { photoRegisterSchema } from "@/lib/validation/doctor-extras";

type Context = { params: Promise<{ id: string }> };

// DC13: consents and photo metadata for the patient or the visit's doctor. No object names;
// reading an object needs POST /api/visit-photos/:id/read-ticket.
export async function GET(request: Request, context: Context) {
  return endpoint(async () => {
    await connection();
    const { db } = await session(request);
    return json({ photos: await dcxCommand(db, "list_visit_photos", { p_booking_id: await routeId(context) }) });
  });
}

// DC13: the started visit's verified doctor registers one photo under a granted consent, then
// uploads the object with their own session to the returned private bucket and name.
export async function POST(request: Request, context: Context) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, photoRegisterSchema);
    return json({ photo: await dcxCommand(db, "register_visit_photo", { p_booking_id: id, p_consent_id: v.consentId, p_content_type: v.contentType, p_request_key: key }) });
  });
}
