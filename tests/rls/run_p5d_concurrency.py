"""P5 doctor-block races in a unique LOCAL scratch DB (design §11.2, contract §13.3).
Reuses the shared runner (tests/rls/run_p5s_concurrency.py, which imports the built
run_b01_concurrency.py helpers): clone the local schema, replay every migration, commit the
synthetic _b01/_p5s/_p5d fixtures, then run real overlapping transactions with deterministic
lock barriers. No source data, application-schema writes, resets or migrations in the source DB.
Run (Phase B, after the shared block is merged): python tests/rls/run_p5d_concurrency.py
"""
import importlib.util
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("p5s_runner", ROOT / "tests/rls/run_p5s_concurrency.py")
p5s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p5s)
TARGET = "p5d_doctor_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"p5d_doctor_[0-9a-f]{12}", TARGET)
p5s.TARGET = p5s.b01.TARGET = p5s.base.TARGET = TARGET
sql, scalar, race, as_api = p5s.sql, p5s.scalar, p5s.race, p5s.as_api

PATIENT = "b1000000-0000-4000-8000-000000000001"
M = "c1000000-0000-4000-8000-000000000001"
W1 = "c1000000-0000-4000-8000-000000000002"
W2 = "c1000000-0000-4000-8000-000000000003"
OPS_GLOBAL = "c1000000-0000-4000-8000-000000000006"
R_W1, R_W2 = "c6000000-0000-4000-8000-000000000001", "c6000000-0000-4000-8000-000000000002"

# Visits are driven through the real doctor commands while inside the window, then moved with
# the shared shift helper (booking, assignment and reservation together). Ids go to a temp table.
SETUP = f"""
create temp table p5d_ids(name text primary key, value text not null);
create function pg_temp.id(n text) returns uuid language sql as $$ select value::uuid from p5d_ids where name=n $$;
-- Accept everything first: once E/E2 are moved past their window the doctors are busy.
insert into p5d_ids values
 ('E2',pg_temp.p5_book('doctor',pg_temp.p5_at(2),array['{R_W1}']::uuid[])::text),
 ('A',pg_temp.p5_book('doctor',pg_temp.p5_at(2,1),array['{R_W1}']::uuid[])::text),
 ('B',pg_temp.p5_book('doctor',pg_temp.p5_at(2,2),array['{R_W1}']::uuid[])::text),
 ('E',pg_temp.p5_book('doctor',pg_temp.p5_at(3),array['{R_W2}']::uuid[])::text),
 ('C',pg_temp.p5_book('doctor',pg_temp.p5_at(3,1),array['{R_W2}']::uuid[])::text),
 ('D',pg_temp.p5_book('doctor',pg_temp.p5_at(3,2),array['{R_W2}']::uuid[])::text);
select pg_temp.p5_shift(pg_temp.id('E2'),now()+interval '10 minutes');
select pg_temp.to_started(pg_temp.id('E2'),'{W1}');
select pg_temp.p5_shift(pg_temp.id('E2'),now()-interval '14 hours');
select pg_temp.p5_shift(pg_temp.id('E'),now()+interval '10 minutes');
select pg_temp.to_started(pg_temp.id('E'),'{W2}');
select pg_temp.p5_shift(pg_temp.id('E'),now()-interval '14 hours');
select pg_temp.p5_shift(pg_temp.id('A'),now()+interval '10 minutes');
select pg_temp.p5_shift(pg_temp.id('B'),now()+interval '50 minutes');
select pg_temp.to_arrived(pg_temp.id('B'),'{W1}');
select pg_temp.p5_shift(pg_temp.id('C'),now()+interval '10 minutes');
insert into p5d_ids values ('CODE',pg_temp.to_arrived(pg_temp.id('C'),'{W2}','{PATIENT}'));
select pg_temp.p5_shift(pg_temp.id('D'),now()+interval '50 minutes');
select pg_temp.to_arrived(pg_temp.id('D'),'{W2}');
select set_config('request.jwt.claims','',true);
select 'ID '||name||'='||value from p5d_ids;
"""

def fixtures():
    tests = ROOT / "supabase/tests"
    doctor = "\n".join(line for line in (tests / "_p5d_fixture.inc").read_text().splitlines() if not line.startswith("\\ir "))
    return (tests / "_b01_fixture.inc").read_text() + (tests / "_p5s_fixture.inc").read_text() + doctor


def concurrency():
    out = sql("begin;" + fixtures() + SETUP + "commit;")
    ids = dict(re.findall(r"^ID (A|B|C|D|E2|E|CODE)=([0-9a-f-]{36}|[0-9]{6})$", out, re.M))
    if len(ids) != 7:
        raise RuntimeError("Setup did not return every booking: " + str(sorted(ids)))
    print("PASS: synthetic doctor visits committed through the real doctor commands", flush=True)

    k = lambda: uuid.uuid4()
    # C1: cancel and en_route at the same time; the cancel wins, en_route finds no live assignment.
    race(as_api(M) + f"select public.cancel_booking('{ids['A']}',4,'provider_unavailable');",
         as_api(W1) + f"select public.advance_visit('{ids['A']}','en_route',4,'{k()}');", "42501")
    if scalar(f"select state||':'||(select substate from public.doctor_visits where booking_id=b.id) from public.bookings b where id='{ids['A']}';") != "cancelled:scheduled":
        raise RuntimeError("Cancel vs en_route did not leave exactly the cancellation")
    print("PASS: C1 cancel vs en_route: one wins, the other is refused", flush=True)

    # C2: completion (closeout, past the window) and ops close, in both orders.
    close = "select public.ops_close_booking('{b}',8,'interrupted','ops_closeout','{key}');"
    complete = "select public.advance_visit('{b}','service_completed',8,'{key}');"
    race(as_api(W2) + complete.format(b=ids["E"], key=k()), as_api(OPS_GLOBAL) + close.format(b=ids["E"], key=k()), "40001")
    race(as_api(OPS_GLOBAL) + close.format(b=ids["E2"], key=k()), as_api(W1) + complete.format(b=ids["E2"], key=k()), "42501")
    terminal = "select state||':'||(select count(*) from public.booking_events e where e.booking_id=b.id and e.to_state in ('completed','interrupted')) from public.bookings b where id='{b}';"
    if scalar(terminal.format(b=ids["E"])) != "completed:1" or scalar(terminal.format(b=ids["E2"])) != "interrupted:1":
        raise RuntimeError("Completion vs ops close did not commit exactly one terminal step")
    print("PASS: C2 completion vs ops close in both orders: exactly one terminal step", flush=True)

    # C5 / §13.3: one absence key delivered twice concurrently.
    key = k()
    same = as_api(W1) + f"select public.report_patient_absent('{ids['B']}',6,'{key}');"
    race(same, same, None)
    if scalar(f"select count(*) from public.booking_events where booking_id='{ids['B']}' and reason='absence_reported';") != "1" \
            or scalar(f"select count(*) from public.booking_exceptions where booking_id='{ids['B']}' and kind='absence_reported';") != "1" \
            or scalar(f"select count(*) from public.idempotency_requests where action='p5.doctor.absence' and request_key='{key}';") != "1":
        raise RuntimeError("Duplicate absence delivery wrote more than one event, exception or replay row")
    print("PASS: C5 duplicate absence key: both return, one event, one exception, one replay row", flush=True)

    # M1: one failed verification key delivered twice concurrently counts once.
    wrong = str((int(ids["CODE"]) + 1) % 1000000).zfill(6)
    key = k()
    same = as_api(W2) + f"select public.verify_arrival_code('{ids['C']}','{wrong}',6,'{key}');"
    race(same, same, None)
    if scalar(f"select attempts from doctor_private.arrival_challenges where booking_id='{ids['C']}' and status='active';") != "1" \
            or scalar(f"select count(*) from doctor_private.verify_failures where booking_id='{ids['C']}';") != "1":
        raise RuntimeError("Duplicate failed verification counted more than one attempt")
    print("PASS: duplicate failed-verification key: one attempt, one failure record", flush=True)

    # H3: one issuance key delivered twice concurrently issues one code.
    key = k()
    same = as_api(PATIENT) + f"select public.issue_arrival_code('{ids['D']}','{key}');"
    race(same, same, None)
    if scalar(f"select count(*) from doctor_private.arrival_challenges where booking_id='{ids['D']}';") != "1":
        raise RuntimeError("Duplicate issuance key created more than one challenge")
    print("PASS: duplicate issuance key: one challenge", flush=True)


def build():
    """The shared p5s.build() with three more schemas in the scratch reset. After a local
    `supabase db reset` the cloned schema already holds doctor_private (001610) and the P01a
    payments_private/payments_worker schemas, which the migration replay creates again."""
    base = p5s.base
    schema = base.call(["exec", base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"], timeout=180)
    sql('create database "' + TARGET + '";', db="postgres")
    sql(p5s.without_cron(schema), user="supabase_admin")
    # Every block's <name>_private/<name>_worker schema, so new blocks need no edit here.
    reset = "do $$ declare s text;begin for s in select nspname from pg_namespace where nspname like '%\\_private' or nspname like '%\\_worker' loop execute format('drop schema %I cascade',s);end loop;end $$;"
    reset += "drop schema if exists doctor_private cascade;drop schema if exists payments_private cascade;drop schema if exists payments_worker cascade;"
    reset += "drop schema public cascade;drop schema if exists identity_private cascade;drop schema if exists providers_private cascade;drop schema if exists catalog_private cascade;drop schema if exists booking_private cascade;create schema public authorization postgres;grant usage on schema public to anon,authenticated,service_role;grant all on schema public to postgres,service_role;"
    reset += "do $$ declare p record;begin for p in select schemaname,tablename,policyname from pg_policies where schemaname='storage' and tablename in ('objects','buckets') loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);end loop;end $$;"
    sql(reset, user="supabase_admin")
    paths = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    for path in paths:
        text = path.read_text(encoding="utf-8")
        sql(p5s.without_cron(text) if path.name.startswith("20261117000670_") else text)
    print("PASS: fresh replay of every migration through " + paths[-1].name, flush=True)


def drop():
    assert re.fullmatch(r"p5d_doctor_[0-9a-f]{12}", TARGET)
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
