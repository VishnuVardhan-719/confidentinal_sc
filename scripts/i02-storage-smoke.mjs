// I02 local Storage smoke test: exercises the real Storage API (not SQL simulation) against the
// local stack only. Synthetic users; keys are read from `supabase status` in-process and never printed.
// Usage (from the worktree root, stack running): node scripts/i02-storage-smoke.mjs
import { execSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const url = env.API_URL;
if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("refusing: not a local stack");
const anonKey = env.ANON_KEY;
const bucket = "provider-verification";
const results = [];
const check = (name, ok) => results.push({ name, ok: Boolean(ok) });

async function signUp() {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signUp({
    email: `synthetic-i02-smoke-${randomUUID()}@example.invalid`,
    password: randomUUID(),
  });
  if (error) throw new Error(`signup failed: ${error.message}`);
  return client;
}
async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.code} ${error.message}`);
  return data;
}
const pdf = (n) => {
  const b = Buffer.alloc(n, 0x20);
  b.write("%PDF-1.4\n", 0);
  return b;
};
async function register(client, providerId, type, mime, size, key) {
  const rows = await rpc(client, "register_provider_document", {
    p_provider_id: providerId, p_subject_profile_id: null, p_document_type: type, p_mime_type: mime,
    p_size_bytes: size, p_label: "SYNTHETIC", p_issued_on: null, p_expires_on: null, p_idempotency_key: key,
  });
  return rows[0];
}

const a = await signUp();
const b = await signUp();
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const providerId = await rpc(a, "create_provider", { p_category: "caretaker", p_organization_id: null, p_display_name: "SYNTHETIC Smoke Carer" });

const body = pdf(1500);
const doc = await register(a, providerId, "care_government_id", "application/pdf", body.length, randomUUID());
const other = await register(a, providerId, "care_training_certificate", "application/pdf", 900, randomUUID());

let r = await a.storage.from(bucket).upload(doc.object_path, body, { contentType: "application/pdf", upsert: false });
check("owner uploads to reserved path", !r.error);
r = await a.storage.from(bucket).upload(doc.object_path, pdf(1500), { contentType: "application/pdf", upsert: true });
check("upsert/overwrite of stored evidence rejected", r.error);
r = await a.storage.from(bucket).upload(`${providerId}/${randomUUID()}`, pdf(10), { contentType: "application/pdf" });
check("guessed path without metadata rejected", r.error);
r = await b.storage.from(bucket).upload(other.object_path, pdf(900), { contentType: "application/pdf" });
check("other user cannot upload to someone else's reserved path", r.error);
r = await anon.storage.from(bucket).upload(other.object_path, pdf(900), { contentType: "application/pdf" });
check("anon cannot upload", r.error);
r = await a.storage.from(bucket).upload(other.object_path, Buffer.from("<html></html>"), { contentType: "text/html" });
check("disallowed MIME rejected by bucket", r.error);

const big = await register(a, providerId, "care_training_certificate", "application/pdf", 5242880, randomUUID());
r = await a.storage.from(bucket).upload(big.object_path, pdf(5242881), { contentType: "application/pdf" });
check("object over 5 MiB rejected by bucket", r.error);

const sha = createHash("sha256").update(body).digest("hex");
const confirm = await a.rpc("confirm_provider_document", { p_document_id: doc.document_id, p_sha256: sha });
check("confirm matches real Storage metadata", !confirm.error);

r = await a.storage.from(bucket).createSignedUrl(doc.object_path, 60);
check("owner cannot sign a URL without a ticket", r.error);
await rpc(a, "authorize_provider_document_access", { p_document_id: doc.document_id, p_purpose: "owner_view" });
r = await a.storage.from(bucket).createSignedUrl(doc.object_path, 60);
check("owner signs a 60 s URL with a ticket", !r.error && r.data?.signedUrl);
if (r.data?.signedUrl) {
  const res = await fetch(r.data.signedUrl);
  const got = Buffer.from(await res.arrayBuffer());
  check("signed URL returns the uploaded bytes", res.status === 200 && got.equals(body));
}
r = await b.storage.from(bucket).createSignedUrl(doc.object_path, 60);
check("other user cannot sign a URL", r.error);
r = await b.storage.from(bucket).download(doc.object_path);
check("other user cannot download", r.error);
r = await anon.storage.from(bucket).download(doc.object_path);
check("anon cannot download", r.error);
const ticketOther = await b.rpc("authorize_provider_document_access", { p_document_id: doc.document_id, p_purpose: "owner_view" });
check("other user cannot obtain a ticket", ticketOther.error);

await a.storage.from(bucket).remove([doc.object_path]);
r = await a.storage.from(bucket).download(doc.object_path);
check("owner delete via Storage API does not remove evidence", !r.error);

const list = await a.storage.from(bucket).list(providerId);
check("listing reveals only ticketed objects", !list.error && (list.data ?? []).length <= 1);

for (const { name, ok } of results) console.log(`${ok ? "ok    " : "FAIL  "} ${name}`);
const failed = results.filter((x) => !x.ok).length;
console.log(`checks=${results.length} failed=${failed}`);
process.exit(failed ? 1 : 0);
