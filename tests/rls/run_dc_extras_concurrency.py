"""DC-extras races in a unique LOCAL scratch DB (design docs/specs/DC_extras_design.md §5-§7).
Reuses the shared runner (tests/rls/run_p5s_concurrency.py, which imports the built
run_b01_concurrency.py helpers): clone the local schema, replay every migration, commit the
synthetic _b01/_p5s/_p5d/_dcx fixtures, then run real overlapping transactions with
deterministic lock barriers. No source data, application-schema writes, resets or migrations
in the source DB. Authored, DB NOT EXECUTED.
Run (after feat/DC-clinical-core and this branch are merged): python tests/rls/run_dc_extras_concurrency.py
"""
import importlib.util
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("p5s_runner", ROOT / "tests/rls/run_p5s_concurrency.py")
p5s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p5s)
TARGET = "dcx_extras_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"dcx_extras_[0-9a-f]{12}", TARGET)
p5s.TARGET = p5s.b01.TARGET = p5s.base.TARGET = TARGET
sql, scalar, race, as_api = p5s.sql, p5s.scalar, p5s.race, p5s.as_api

PATIENT = "b1000000-0000-4000-8000-000000000001"
PATIENT_ID = "b2000000-0000-4000-8000-000000000001"
DOCTOR = "b1000000-0000-4000-8000-000000000002"

# V1 completed (proofs); V2 started (photos, facts). Two live proofs on V1, two consents and
# two facts for the races.
SETUP = f"""
create temp table dcx_ids(name text primary key, value text not null);
create function pg_temp.id(n text) returns uuid language sql as $$ select value::uuid from dcx_ids where name=n $$;
insert into dcx_ids select 'V'||k,x::text from unnest(pg_temp.dcx_started(2)) with ordinality u(x,k);
select pg_temp.dcx_complete(pg_temp.id('V1'));
select pg_temp.as_user('{PATIENT}');
select public.issue_visit_proof(pg_temp.id('V1'),24,gen_random_uuid());
select public.issue_visit_proof(pg_temp.id('V1'),24,gen_random_uuid());
insert into dcx_ids values
 ('C1',public.grant_photo_consent(pg_temp.id('V2'),'wound_documentation','photo-v1',gen_random_uuid())::text),
 ('C2',public.grant_photo_consent(pg_temp.id('V2'),'skin_condition','photo-v1',gen_random_uuid())::text),
 ('F1',public.record_health_fact('{PATIENT_ID}','allergy','Synthetic allergy one',gen_random_uuid())->>'fact_id'),
 ('F2',public.record_health_fact('{PATIENT_ID}','allergy','Synthetic allergy two',gen_random_uuid())->>'fact_id');
select set_config('request.jwt.claims','',true);
select 'ID '||name||'='||value from dcx_ids;
"""
ID = re.compile(r"^ID (V1|V2|C1|C2|F1|F2)=([0-9a-f-]{36})$", re.M)


def fixtures():
    tests = ROOT / "supabase/tests"
    strip = lambda name: "\n".join(line for line in (tests / name).read_text(encoding="utf-8").splitlines() if not line.startswith("\\ir "))
    return (tests / "_b01_fixture.inc").read_text(encoding="utf-8") + (tests / "_p5s_fixture.inc").read_text(encoding="utf-8") \
        + strip("_p5d_fixture.inc") + "\n" + strip("_dcx_fixture.inc") + "\n"


def concurrency():
    out = sql("begin;" + fixtures() + SETUP + "commit;")
    ids = dict(ID.findall(out))
    if len(ids) != 6:
        raise RuntimeError("Setup did not return every id: " + str(sorted(ids)))
    print("PASS: synthetic DC-extras fixtures committed through the public paths", flush=True)
    k = lambda: uuid.uuid4()

    # R1 (DC12): two issuances at 2 live tokens; the booking lock serialises the cap.
    issue = "select public.issue_visit_proof('{b}',24,'{key}');"
    race(as_api(PATIENT) + issue.format(b=ids["V1"], key=k()), as_api(PATIENT) + issue.format(b=ids["V1"], key=k()), "53300")
    if scalar(f"select count(*) from dcx_private.visit_proof_tokens where booking_id='{ids['V1']}' and revoked_at is null and expires_at>clock_timestamp();") != "3":
        raise RuntimeError("Concurrent issuance exceeded the live-token cap")
    print("PASS: R1 concurrent proof issuance: exactly 3 live tokens", flush=True)

    # R2 (DC13): withdrawal and registration on one consent, both orders.
    withdraw = "select public.withdraw_photo_consent('{c}',1,'{key}');"
    register = "select public.register_visit_photo('{b}','{c}','image/jpeg','{key}');"
    race(as_api(PATIENT) + withdraw.format(c=ids["C1"], key=k()), as_api(DOCTOR) + register.format(b=ids["V2"], c=ids["C1"], key=k()), "42501")
    if scalar(f"select count(*) from public.visit_photos where consent_id='{ids['C1']}';") != "0":
        raise RuntimeError("A photo was registered after its consent was withdrawn")
    race(as_api(DOCTOR) + register.format(b=ids["V2"], c=ids["C2"], key=k()), as_api(PATIENT) + withdraw.format(c=ids["C2"], key=k()), None)
    if scalar(f"select count(*)||':'||count(*) filter (where status='withdrawn' and delete_after is not null) from public.visit_photos where consent_id='{ids['C2']}';") != "1:1":
        raise RuntimeError("Withdrawal did not withdraw the photo registered just before it")
    if scalar("select count(*) from public.visit_photos p join public.visit_photo_consents c on c.id=p.consent_id where c.status='withdrawn' and p.status='active';") != "0":
        raise RuntimeError("An active photo remains under a withdrawn consent")
    print("PASS: R2 withdrawal vs registration in both orders: no active photo under a withdrawn consent", flush=True)

    # R3 (DC11): revision committing first makes the review of the old version stale.
    revise = f"select public.revise_health_fact('{ids['F1']}','Synthetic allergy one, revised',1,'{k()}');"
    verify = "select public.verify_health_fact('{f}',1,'{b}','confirmed','document_reviewed','DOC-1','{key}');"
    race(as_api(PATIENT) + revise, as_api(DOCTOR) + verify.format(f=ids["F1"], b=ids["V2"], key=k()), "40001")
    if scalar(f"select (select current_version from public.health_facts where id='{ids['F1']}')||':'||count(*) from public.health_fact_verifications where fact_id='{ids['F1']}';") != "2:0":
        raise RuntimeError("A review committed against a superseded fact version")
    print("PASS: R3 revision vs review: the review of the old version is refused", flush=True)

    # R4 (DC11): one review key delivered twice at once.
    key = k()
    same = as_api(DOCTOR) + verify.format(f=ids["F2"], b=ids["V2"], key=key)
    race(same, same, None)
    if scalar(f"select count(*) from public.health_fact_verifications where fact_id='{ids['F2']}';") != "1" \
            or scalar(f"select count(*) from public.idempotency_requests where action='dcx.fact.verify' and request_key='{key}';") != "1":
        raise RuntimeError("Duplicate review key wrote more than one review or replay row")
    print("PASS: R4 duplicate review key: one review, one replay row", flush=True)


def build():
    """The doctor runner's build(): reset every <name>_private/<name>_worker schema in the
    scratch clone, then replay every migration (UTF-8)."""
    base = p5s.base
    schema = base.call(["exec", base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"], timeout=180)
    sql('create database "' + TARGET + '";', db="postgres")
    sql(p5s.without_cron(schema), user="supabase_admin")
    reset = "do $$ declare s text;begin for s in select nspname from pg_namespace where nspname like '%\\_private' or nspname like '%\\_worker' loop execute format('drop schema %I cascade',s);end loop;end $$;"
    reset += "drop schema public cascade;drop schema if exists identity_private cascade;drop schema if exists providers_private cascade;drop schema if exists catalog_private cascade;drop schema if exists booking_private cascade;create schema public authorization postgres;grant usage on schema public to anon,authenticated,service_role;grant all on schema public to postgres,service_role;"
    reset += "do $$ declare p record;begin for p in select schemaname,tablename,policyname from pg_policies where schemaname='storage' and tablename in ('objects','buckets') loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);end loop;end $$;"
    sql(reset, user="supabase_admin")
    paths = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    for path in paths:
        text = path.read_text(encoding="utf-8")
        sql(p5s.without_cron(text) if path.name.startswith("20261117000670_") else text)
    print("PASS: fresh replay of every migration through " + paths[-1].name, flush=True)


def drop():
    assert re.fullmatch(r"dcx_extras_[0-9a-f]{12}", TARGET)
    sql('drop database if exists "' + TARGET + '" with (force);', db="postgres", user="supabase_admin")
    print("PASS: scratch database removed; source DB unchanged", flush=True)


def main():
    p5s.base.assert_local_target()
    try:
        build()
        concurrency()
    finally:
        drop()


if __name__ == "__main__":
    main()
