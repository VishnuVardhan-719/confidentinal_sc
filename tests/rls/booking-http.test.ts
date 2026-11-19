import { createHmac, randomInt, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { GET as listBookings, POST as createBooking } from "@/app/api/bookings/route";
import { GET as getBooking } from "@/app/api/bookings/[id]/route";
import { POST as acceptBooking } from "@/app/api/bookings/[id]/accept/route";
import { POST as declineBooking } from "@/app/api/bookings/[id]/decline/route";
import { POST as cancelBooking } from "@/app/api/bookings/[id]/cancel/route";
import { POST as arriveBooking } from "@/app/api/bookings/[id]/arrive/route";

// Q01-T10. Opt-in integration test against the explicitly named LOCAL synthetic stack:
// real route handlers -> supabase-js -> local Kong/Auth/PostgREST -> B01 RPCs.
// Run: Q01_BOOKING_HTTP=1 node node_modules/vitest/vitest.mjs run tests/rls/booking-http.test.ts
// Credentials stay in memory. Never print container inspection or raw logs.
// Unknown body fields return 422 (strict Zod schemas), not the 400 the matrix guessed.
function docker(args: string[]) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 20_000 });
  if (result.status !== 0) throw new Error("Local Docker test command failed");
  return result.stdout;
}
const sql = (statement: string) => docker(["exec", "supabase_db_surecurevisit", "psql", "-U", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement]).trim();

type Context = { params: Promise<{ id: string }> };
type Body = Record<string, unknown> | undefined;

it.runIf(process.env.Q01_BOOKING_HTTP === "1")("booking routes enforce actor, input shape and server-derived price over real HTTP", async () => {
  const inspected = JSON.parse(docker(["inspect", "supabase_storage_surecurevisit"]));
  const config = Object.fromEntries((inspected[0].Config.Env as string[]).map(v => [v.slice(0, v.indexOf("=")), v.slice(v.indexOf("=") + 1)]));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:58421";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = config.ANON_KEY;

  const id = () => randomUUID();
  const [patient, doctor, outsider] = [id(), id(), id()];
  const f = { patientRow: id(), consent: id(), provider: id(), doc: id(), catalog: id(), service: id(), price: id(),
    area: id(), address: id(), resource: id(), pin: String(randomInt(590000, 600000)), code: "q01_http_" + randomUUID().slice(0, 8) };
  const users = [patient, doctor, outsider];
  const token = (actor: string) => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: actor, role: "authenticated", aud: "authenticated", aal: "aal1", iat: now, exp: now + 300 };
    const message = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify(claims)).toString("base64url");
    return message + "." + createHmac("sha256", config.AUTH_JWT_SECRET).update(message).digest("base64url");
  };
  const request = (path: string, actor: string | null, body: Body, method = "POST", key?: string) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (actor) headers.Authorization = `Bearer ${token(actor)}`;
    if (key) headers["Idempotency-Key"] = key;
    return new Request("http://localhost" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  const ctx = (bookingId: string): Context => ({ params: Promise.resolve({ id: bookingId }) });
  const on = async (handler: (r: Request, c: Context) => Promise<Response>, bookingId: string, action: string, actor: string | null, body?: Body) =>
    handler(request(`/api/bookings/${bookingId}/${action}`, actor, body), ctx(bookingId));
  const day = new Date();
  const startAt = (hours: number) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 2, 4 + hours)).toISOString();
  const valid = (hours = 0) => ({ patientId: f.patientRow, serviceId: f.service, addressId: f.address, startAt: startAt(hours) });
  const bookingRows = () => sql(`select count(*) from public.bookings where patient_id='${f.patientRow}'`);
  let seeded = false;

  try {
    const auth = (u: string, n: number) => `('${u}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','q01-http-${n}-${u}@example.invalid',now(),'{}','{}','','','','',now(),now())`;
    sql(`begin;
      insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change,created_at,updated_at)
       values ${users.map((u, n) => auth(u, n)).join(",")};
      insert into public.patients(id,self_profile_id) values ('${f.patientRow}','${patient}');
      insert into public.consent_events(id,actor_profile_id,patient_id,purpose,policy_version,decision) values ('${f.consent}','${patient}','${f.patientRow}','self_patient_access','synthetic-v1','granted');
      insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by)
       select '${f.patientRow}','${patient}',s,'${f.consent}','${patient}' from unnest(array['booking:read','booking:create','profile:read','profile:write']) s;
      insert into public.providers(id,individual_owner_profile_id,category,status,verification_state) values ('${f.provider}','${doctor}','doctor','active','approved');
      insert into public.provider_profiles(provider_id,display_name) values ('${f.provider}','Synthetic Q01 HTTP doctor');
      insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at)
       values ('${f.doc}','${f.provider}','${doctor}','registration','${f.provider}/${f.doc}.pdf','application/pdf','verified',now()+interval '1 year');
      insert into storage.objects(bucket_id,name) values ('provider-verification','${f.provider}/${f.doc}.pdf');
      insert into public.service_catalog_types(id,code,category,name,unit) values ('${f.catalog}','${f.code}','doctor','Synthetic HTTP visit','visit');
      insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status) values ('${f.service}','${f.provider}','doctor','${f.catalog}','Synthetic HTTP visit',30,'published');
      insert into public.service_price_versions(id,service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
       values ('${f.price}','${f.service}','${f.catalog}',1,45000,'visit','synthetic-v1',now()-interval '1 day');
      insert into public.pin_directory(pin_code,state,district,city,source_reference) values ('${f.pin}','Synthetic','Synthetic','Synthetic','Q01 HTTP synthetic');
      insert into public.provider_service_areas(id,provider_id,pin_code,proposed_by,status,approved_by,approved_at,valid_from,valid_to)
       values ('${f.area}','${f.provider}','${f.pin}','${doctor}','approved','${outsider}',now(),now()-interval '1 day',now()+interval '6 months');
      insert into public.patient_addresses(id,patient_id,line1,locality,pin_code,contact_name,phone)
       values ('${f.address}','${f.patientRow}','Synthetic exact address','Synthetic','${f.pin}','Synthetic patient','+919999999999');
      insert into public.resources(id,kind,person_profile_id) values ('${f.resource}','person','${doctor}');
      insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
       select '${f.provider}','${f.resource}',d,'00:00','23:59',current_date,current_date+365 from generate_series(0,6) d;
      commit;`);
    seeded = true;

    // Create: anon, injected fields, missing idempotency key, foreign actor.
    expect((await createBooking(request("/api/bookings", null, valid(), "POST", id()))).status).toBe(401);
    const injected = { ...valid(), price: 1, amount_paise: 1, status: "confirmed", actor: doctor, paid: true };
    expect((await createBooking(request("/api/bookings", patient, injected, "POST", id()))).status).toBe(422);
    expect((await createBooking(request("/api/bookings", patient, valid()))).status).toBe(422);
    expect((await createBooking(request("/api/bookings", outsider, valid(), "POST", id()))).status).toBe(403);
    expect(bookingRows()).toBe("0");

    const created = await createBooking(request("/api/bookings", patient, valid(), "POST", id()));
    expect(created.status).toBe(201);
    const booking = (await created.json()).id as string;
    expect(sql(`select amount_paise||'|'||state||'|'||version||'|'||price_version_id from public.bookings where id='${booking}'`))
      .toBe(`45000|requested|2|${f.price}`);

    // Read: anon 401, outsider 404, patient sees the server-derived price.
    expect((await getBooking(request(`/api/bookings/${booking}`, null, undefined, "GET"), ctx(booking))).status).toBe(401);
    expect((await getBooking(request(`/api/bookings/${booking}`, outsider, undefined, "GET"), ctx(booking))).status).toBe(404);
    const own = await getBooking(request(`/api/bookings/${booking}`, patient, undefined, "GET"), ctx(booking));
    expect(own.status).toBe(200);
    expect((await own.json()).booking.amount_paise).toBe("45000");
    const foreignList = await listBookings(request("/api/bookings", outsider, undefined, "GET"));
    expect(foreignList.status).toBe(200);
    expect((await foreignList.json()).items).toEqual([]);

    // Accept/decline/cancel: anon 401, foreign actors 403, injected fields 422, nothing changes.
    const accept = { expectedVersion: 2, resourceIds: [f.resource] };
    expect((await on(acceptBooking, booking, "accept", null, accept)).status).toBe(401);
    expect((await on(acceptBooking, booking, "accept", outsider, accept)).status).toBe(403);
    expect((await on(acceptBooking, booking, "accept", patient, accept)).status).toBe(403);
    expect((await on(acceptBooking, booking, "accept", doctor, { ...accept, status: "confirmed" })).status).toBe(422);
    const decline = { expectedVersion: 2, reason: "provider_unavailable" };
    expect((await on(declineBooking, booking, "decline", null, decline)).status).toBe(401);
    expect((await on(declineBooking, booking, "decline", outsider, decline)).status).toBe(403);
    expect((await on(declineBooking, booking, "decline", patient, decline)).status).toBe(403);
    expect((await on(declineBooking, booking, "decline", doctor, { ...decline, paid: true })).status).toBe(422);
    const cancel = { expectedVersion: 2, reason: "other" };
    expect((await on(cancelBooking, booking, "cancel", null, cancel)).status).toBe(401);
    expect((await on(cancelBooking, booking, "cancel", outsider, cancel)).status).toBe(403);
    expect((await on(cancelBooking, booking, "cancel", patient, { ...cancel, actor: doctor })).status).toBe(422);
    expect(sql(`select state||'|'||version from public.bookings where id='${booking}'`)).toBe("requested|2");

    const accepted = await on(acceptBooking, booking, "accept", doctor, accept);
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).version).toBe(4);

    // Arrive: anon 401, outsider/patient 403, injected actor 422, doctor 403 before the service window.
    expect((await on(arriveBooking, booking, "arrive", null, { expectedVersion: 4 })).status).toBe(401);
    expect((await on(arriveBooking, booking, "arrive", outsider, { expectedVersion: 4 })).status).toBe(403);
    expect((await on(arriveBooking, booking, "arrive", patient, { expectedVersion: 4 })).status).toBe(403);
    expect((await on(arriveBooking, booking, "arrive", doctor, { expectedVersion: 4, actor: doctor })).status).toBe(422);
    expect((await on(arriveBooking, booking, "arrive", doctor, { expectedVersion: 4 })).status).toBe(403);

    // Decline happy path on a second request.
    const second = await createBooking(request("/api/bookings", patient, valid(2), "POST", id()));
    expect(second.status).toBe(201);
    const declined = (await second.json()).id as string;
    const declinedResponse = await on(declineBooking, declined, "decline", doctor, decline);
    expect(declinedResponse.status).toBe(200);
    expect((await declinedResponse.json()).version).toBe(3);

    expect(sql(`select string_agg(state||'|'||amount_paise,',' order by state) from public.bookings where patient_id='${f.patientRow}'`))
      .toBe("confirmed|45000,declined|45000");
  } finally {
    if (seeded || sql(`select count(*) from auth.users where id in ('${users.join("','")}')`) !== "0") {
      // Privileged teardown bypasses immutability triggers only inside this local transaction and
      // removes only rows created for these generated synthetic actors; app roles cannot do this.
      const bookings = `(select id from public.bookings where patient_id='${f.patientRow}')`;
      sql(`begin; set local session_replication_role=replica;
        delete from public.notification_outbox where booking_id in ${bookings};
        delete from public.booking_events where booking_id in ${bookings};
        delete from public.doctor_visits where booking_id in ${bookings};
        delete from public.resource_reservations where resource_id='${f.resource}';
        delete from public.booking_assignments where booking_id in ${bookings};
        delete from public.bookings where patient_id='${f.patientRow}';
        delete from public.idempotency_requests where actor_profile_id in ('${users.join("','")}');
        delete from public.audit_events where actor_profile_id in ('${users.join("','")}');
        delete from public.availability_rules where provider_id='${f.provider}';
        delete from public.resources where id='${f.resource}';
        delete from public.patient_addresses where patient_id='${f.patientRow}';
        delete from public.provider_service_areas where provider_id='${f.provider}';
        delete from public.service_price_versions where service_id='${f.service}';
        delete from public.services where id='${f.service}';
        delete from public.service_catalog_types where id='${f.catalog}';
        delete from public.pin_directory where pin_code='${f.pin}' and source_reference='Q01 HTTP synthetic';
        delete from storage.objects where bucket_id='provider-verification' and name='${f.provider}/${f.doc}.pdf';
        delete from public.provider_documents where provider_id='${f.provider}';
        delete from public.provider_profiles where provider_id='${f.provider}';
        delete from public.providers where id='${f.provider}';
        delete from public.patient_access where patient_id='${f.patientRow}';
        delete from public.consent_events where patient_id='${f.patientRow}';
        delete from public.patients where id='${f.patientRow}';
        delete from public.profiles where id in ('${users.join("','")}');
        delete from auth.users where id in ('${users.join("','")}'); commit;`);
    }
  }
}, 180_000);
