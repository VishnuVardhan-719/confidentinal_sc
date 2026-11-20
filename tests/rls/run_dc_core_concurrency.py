"""DC clinical-core races in a unique LOCAL scratch DB (design A9). DB NOT EXECUTED.
Reuses the shared runner (tests/rls/run_p5s_concurrency.py, which imports the built
run_b01_concurrency.py helpers): clone the local schema, replay every migration, commit the
synthetic _b01/_p5s/_p5d/_dc fixtures, then run real overlapping transactions with deterministic
lock barriers. No source data, application-schema writes, resets or migrations in the source DB.
Run (after a local reset): python tests/rls/run_dc_core_concurrency.py
"""
import importlib.util
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("p5s_runner", ROOT / "tests/rls/run_p5s_concurrency.py")
p5s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p5s)
TARGET = "dc_core_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"dc_core_[0-9a-f]{12}", TARGET)
p5s.TARGET = p5s.b01.TARGET = p5s.base.TARGET = TARGET
sql, scalar, race, as_api = p5s.sql, p5s.scalar, p5s.race, p5s.as_api

W1 = "c1000000-0000-4000-8000-000000000002"
W2 = "c1000000-0000-4000-8000-000000000003"

# Accept every visit first, then move them into the window, then start them through the real
# doctor commands. A and B are W1's open drafts at version 1, C is W2's signed record, D is W2's
# open draft at version 1.
SETUP = """
create temp table dc_ids(name text primary key, value text not null);
create function pg_temp.id(n text) returns uuid language sql as $$ select value::uuid from dc_ids where name=n $$;
insert into dc_ids values
 ('A',pg_temp.dc_book('W1',0)::text),('B',pg_temp.dc_book('W1',1)::text),
 ('C',pg_temp.dc_book('W2',2)::text),('D',pg_temp.dc_book('W2',3)::text);
select pg_temp.dc_move(pg_temp.id('A'),0),pg_temp.dc_move(pg_temp.id('B'),1),pg_temp.dc_move(pg_temp.id('C'),2),pg_temp.dc_move(pg_temp.id('D'),3);
select pg_temp.dc_start(pg_temp.id('A'),'W1');
select pg_temp.dc_start(pg_temp.id('B'),'W1');
select pg_temp.dc_start(pg_temp.id('C'),'W2');
select pg_temp.dc_start(pg_temp.id('D'),'W2');
select pg_temp.dc_save(pg_temp.id('A'),'W1',0);
select pg_temp.dc_save(pg_temp.id('B'),'W1',0);
select pg_temp.dc_save(pg_temp.id('C'),'W2',0);
insert into dc_ids select 'RC',pg_temp.dc_sign(pg_temp.id('C'),'W2',1)::text;
select pg_temp.dc_save(pg_temp.id('D'),'W2',0);
select set_config('request.jwt.claims','',true);
select 'ID '||name||'='||value from dc_ids;
"""
ID = re.compile(r"^ID (A|B|C|D|RC)=([0-9a-f-]{36})$", re.M)
CONTENT = """'{"examination":{"findings":"Synthetic race"}}'::jsonb"""
# Race sessions are new connections, so fixture functions (pg_temp) are gone; this literal is
# pg_temp.dc_content() from _dc_fixture.inc with the advice text as a placeholder.
FULL = ('{"vitals":{"temperature":{"value":37.0,"unit":"C"},"systolic":120,"diastolic":80,"pulse_bpm":78,"spo2_pct":98,"resp_rate":16},'
        '"examination":{"chief_complaint":"Synthetic cough","symptom_duration":"3 days","findings":"Synthetic chest clear"},'
        '"assessment":{"summary":"Synthetic viral illness","certainty":"provisional",'
        '"diagnoses":[{"label":"Synthetic upper respiratory infection","certainty":"probable"}],"outcome":"follow_up"},'
        '"allergies":{"status":"recorded","items":[{"substance":"Penicillin","reaction":"Synthetic rash"}]},'
        '"prescription":{"status":"prescribed","items":[{"medication_name":"Paracetamol","form":"tablet","strength":"500 mg",'
        '"dose":"1 tablet","route":"oral","frequency":"three_times_daily","duration_days":3,"quantity":9}]},'
        '"plan":{"advice":"ADVICE","follow_up_on":"2026-12-01","tests":[{"name":"Synthetic CBC"}]}}')


def fixtures():
    tests = ROOT / "supabase/tests"
    strip = lambda name: "\n".join(line for line in (tests / name).read_text(encoding="utf-8").splitlines() if not line.startswith("\\ir "))
    return "".join((tests / name).read_text(encoding="utf-8") for name in ("_b01_fixture.inc", "_p5s_fixture.inc")) \
        + strip("_p5d_fixture.inc") + "\n" + strip("_dc_fixture.inc") + "\n"


def concurrency():
    out = sql("begin;" + fixtures() + SETUP + "commit;")
    ids = dict(ID.findall(out))
    if len(ids) != 5:
        raise RuntimeError("Setup did not return every id: " + str(sorted(ids)))
    print("PASS: synthetic visits, drafts and one signed record committed through the public paths", flush=True)
    k = lambda: uuid.uuid4()
    save = "select public.save_clinical_draft('{b}',{v},{c},'{key}');"
    sign = "select public.sign_clinical_record('{b}',{v},true,true,'{key}');"
    amend = "select public.amend_clinical_record('{r}','{c}'::jsonb,'{reason}',true,true,'{key}');"

    # D1: two autosaves on one version; the second gets stale_version (DC05).
    race(as_api(W1) + save.format(b=ids["A"], v=1, c=CONTENT, key=k()), as_api(W1) + save.format(b=ids["A"], v=1, c=CONTENT, key=k()), "40001")
    if scalar(f"select version from clinical_private.consultations where booking_id='{ids['A']}';") != "2":
        raise RuntimeError("Two saves on one version did not leave exactly one new version")
    print("PASS: D1 two saves on one draft version: one commits, one stale_version", flush=True)

    # D2: signing and an autosave on the same version; the save finds the draft signed.
    race(as_api(W1) + sign.format(b=ids["B"], v=1, key=k()), as_api(W1) + save.format(b=ids["B"], v=1, c=CONTENT, key=k()), "55000")
    if scalar(f"select status||':'||version||':'||(select count(*) from clinical_private.clinical_records r where r.booking_id=c.booking_id)"
              f" from clinical_private.consultations c where booking_id='{ids['B']}';") != "signed:1:1":
        raise RuntimeError("Sign vs save did not freeze exactly the signed version")
    print("PASS: D2 sign vs save: the record freezes version 1, the save is refused", flush=True)

    # D3: two amendments of the same latest version; the chain does not fork (DC07).
    race(as_api(W2) + amend.format(r=ids["RC"], c=FULL.replace("ADVICE", "Synthetic A"), reason="Synthetic A", key=k()),
         as_api(W2) + amend.format(r=ids["RC"], c=FULL.replace("ADVICE", "Synthetic B"), reason="Synthetic B", key=k()), "55000")
    if scalar(f"select count(*)||':'||max(record_version) from clinical_private.clinical_records where booking_id='{ids['C']}';") != "2:2":
        raise RuntimeError("Two amendments of one version did not leave exactly one successor")
    print("PASS: D3 two amendments of one version: one commits, one record_superseded", flush=True)

    # D4: one sign key delivered twice concurrently: both return, one record, one replay row.
    key = k()
    same = as_api(W2) + sign.format(b=ids["D"], v=1, key=key)
    race(same, same, None)
    if scalar(f"select count(*) from clinical_private.clinical_records where booking_id='{ids['D']}';") != "1" \
            or scalar(f"select count(*) from public.idempotency_requests where action='clinical.sign' and request_key='{key}';") != "1":
        raise RuntimeError("One sign key raced twice wrote more than one record or replay row")
    print("PASS: D4 duplicate sign key: both return, one record, one replay row", flush=True)


def build():
    """The shared p5s.build() reading migrations as UTF-8, dropping every block's private schema."""
    base = p5s.base
    schema = base.call(["exec", base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"], timeout=180)
    sql('create database "' + TARGET + '";', db="postgres")
    sql(p5s.without_cron(schema), user="supabase_admin")
    # Every block's <name>_private/<name>_worker schema (clinical_private included).
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
    assert re.fullmatch(r"dc_core_[0-9a-f]{12}", TARGET)
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
