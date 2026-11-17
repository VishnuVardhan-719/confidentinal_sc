import { randomUUID, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

// Opt-in integration test against this explicitly named LOCAL synthetic target.
// Credentials remain in memory. Never print container inspection or raw logs.
function docker(args: string[]) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 20_000 });
  if (result.status !== 0) throw new Error("Local Docker test command failed");
  return result.stdout + (args[0] === "logs" ? result.stderr : "");
}
const sql = (statement: string) => docker(["exec", "supabase_db_surecurevisit", "psql", "-U", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement]).trim();

it.runIf(process.env.I02_STORAGE_HTTP === "1")("denies direct Storage signing and records real operation names", async () => {
  const inspected = JSON.parse(docker(["inspect", "supabase_storage_surecurevisit"]));
  const config = Object.fromEntries((inspected[0].Config.Env as string[]).map(v => [v.slice(0, v.indexOf("=")), v.slice(v.indexOf("=") + 1)]));
  const actor = randomUUID();
  const claims = { sub: actor, role: "authenticated", aud: "authenticated", aal: "aal1", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 };
  const message = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify(claims)).toString("base64url");
  const jwt = message + "." + createHmac("sha256", config.AUTH_JWT_SECRET).update(message).digest("base64url");
  const db = createClient("http://127.0.0.1:58421", config.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const cleanup = createClient("http://127.0.0.1:58421", config.SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const started = new Date().toISOString();
  let objectPath: string | undefined;
  let observerInstalled = false;
  try {
    const raw = sql(`begin; insert into auth.users(id,email) values('${actor}','i02-http-${actor}@example.invalid');
      set local role authenticated; select set_config('request.jwt.claims','${JSON.stringify(claims)}',true);
      select public.create_provider('doctor','Synthetic HTTP','',null);
      select public.add_provider_document((select id from public.providers where individual_owner_profile_id='${actor}'),'registration','application/pdf',now()+interval '1 year',1); commit;`);
    objectPath = JSON.parse(raw.split(/\r?\n/).at(-1)!).document.object_name;
    // Transactional DB writes would roll back on denied signing. A narrowly scoped
    // LOG message records the real service GUC without changing the policy result.
    sql(`create function providers_private.i02_http_operation() returns text language plpgsql security definer set search_path='' as $observe$
      begin if auth.uid()='${actor}'::uuid then raise log 'I02_HTTP_OPERATION:%',storage.operation(); end if;
      return storage.operation(); end; $observe$;
      revoke all on function providers_private.i02_http_operation() from public,anon;
      grant execute on function providers_private.i02_http_operation() to authenticated;
      alter policy i02_no_signing on storage.objects
      using(coalesce(providers_private.i02_http_operation(),'') not in ('storage.object.sign','storage.object.sign_many','storage.object.sign_upload_url','storage.render.image_sign'))
      with check(coalesce(providers_private.i02_http_operation(),'') not in ('storage.object.sign','storage.object.sign_many','storage.object.sign_upload_url','storage.render.image_sign'));`);
    observerInstalled = true;
    const bucket = db.storage.from("provider-verification");
    const upload = await bucket.upload(objectPath!, new TextEncoder().encode("%PDF-1.4\nSynthetic fixture\n%%EOF"), { contentType: "application/pdf", upsert: false });
    expect(upload.error?.message).toBeUndefined();
    expect((await bucket.download(objectPath!)).error).toBeNull();
    const single = await bucket.createSignedUrl(objectPath!, 86_400);
    expect(single.error).not.toBeNull();
    expect(single.data).toBeNull();
    const batch = await bucket.createSignedUrls([objectPath!], 86_400);
    expect(Boolean(batch.error) || batch.data?.every(item => !item.signedUrl && Boolean(item.error))).toBe(true);
    const signedUpload = await bucket.createSignedUploadUrl(objectPath!);
    expect(signedUpload.error).not.toBeNull();
    expect(signedUpload.data).toBeNull();
    const log = docker(["logs", "--since", started, "supabase_db_surecurevisit"]);
    const observed = new Set([...log.matchAll(/I02_HTTP_OPERATION:([a-z._]+)/g)].map(match => match[1]));
    for (const operation of ["storage.object.sign", "storage.object.sign_many", "storage.object.sign_upload_url"]) expect(observed.has(operation), operation).toBe(true);
    console.info("Real Storage operations denied:", [...observed].filter(op => op.includes("sign")).sort().join(", "));
  } finally {
    if (observerInstalled) sql(`alter policy i02_no_signing on storage.objects
      using(coalesce(storage.operation(),'') not in ('storage.object.sign','storage.object.sign_many','storage.object.sign_upload_url','storage.render.image_sign'))
      with check(coalesce(storage.operation(),'') not in ('storage.object.sign','storage.object.sign_many','storage.object.sign_upload_url','storage.render.image_sign'));
      drop function providers_private.i02_http_operation();`);
    if (objectPath) expect((await cleanup.storage.from("provider-verification").remove([objectPath])).error).toBeNull();
    // Privileged teardown bypasses triggers only inside this local transaction and
    // removes only this generated synthetic actor; app roles cannot do this.
    sql(`begin; set local session_replication_role=replica;
      delete from public.audit_events where actor_profile_id='${actor}';
      delete from public.provider_documents where owner_profile_id='${actor}';
      delete from public.provider_profiles where provider_id in(select id from public.providers where individual_owner_profile_id='${actor}');
      delete from public.providers where individual_owner_profile_id='${actor}';
      delete from public.profiles where id='${actor}'; delete from auth.users where id='${actor}'; commit;`);
  }
}, 60_000);
