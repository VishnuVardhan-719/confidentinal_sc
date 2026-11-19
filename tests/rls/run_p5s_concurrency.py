"""P5 shared-engine races in a unique LOCAL scratch DB (contract §6.5, §11.5 (7), §13.3).
Clones the local schema, replays every migration, commits the synthetic _b01/_p5s
fixtures, then runs real overlapping transactions with deterministic lock barriers.
No source data, application-schema writes, resets or migrations in the source DB.
Run: python tests/rls/run_p5s_concurrency.py
"""
import importlib.util
import json
import re
import subprocess
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("b01_runner", ROOT / "tests/rls/run_b01_concurrency.py")
b01 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b01)
base = b01.base
TARGET = "p5s_engine_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"p5s_engine_[0-9a-f]{12}", TARGET)
b01.TARGET = TARGET
base.TARGET = TARGET
sql = b01.sql

PATIENT = "b1000000-0000-4000-8000-000000000001"
M = "c1000000-0000-4000-8000-000000000001"
W1 = "c1000000-0000-4000-8000-000000000002"
W2 = "c1000000-0000-4000-8000-000000000003"
OPS = "c1000000-0000-4000-8000-000000000005"
OPS_GLOBAL = "c1000000-0000-4000-8000-000000000006"
R_W1, R_W2 = "c6000000-0000-4000-8000-000000000001", "c6000000-0000-4000-8000-000000000002"
R_V1, R_V2 = "c6000000-0000-4000-8000-000000000003", "c6000000-0000-4000-8000-000000000004"


def claims(actor):
    return "select set_config('request.jwt.claims','" + json.dumps({"sub": actor, "aal": "aal2", "role": "authenticated"}) + "',true);"


def as_api(actor):
    """Run the following statements as the authenticated API role."""
    return "set local role authenticated;" + claims(actor)


def as_command(actor):
    """Run private engine helpers as a category command would: definer owner, caller's claims."""
    return "reset role;" + claims(actor)


def race(first, second, expect_second):
    """first holds its locks (pg_sleep) while second blocks on a lock; then both finish.
    expect_second is None (second must succeed) or the SQLSTATE it must fail with."""
    apps = ["p5s_race_" + uuid.uuid4().hex[:10] for _ in range(2)]
    procs = []

    def start(index, statement):
        text = "set application_name='" + apps[index] + "';begin;" + statement
        text += ("select pg_sleep(4);" if index == 0 else "") + "commit;"
        proc = subprocess.Popen([base.DOCKER, *b01.args(), "-v", "VERBOSITY=verbose"], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        procs.append(proc)
        proc.stdin.write(text)
        proc.stdin.close()
        return proc

    def barrier(proc, app, condition):
        deadline = time.monotonic() + 15
        while sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='" + app + "' and " + condition + ";").strip() != "1":
            if proc.poll() is not None:
                raise RuntimeError("Race failed before barrier: " + proc.stderr.read()[-1800:])
            if time.monotonic() > deadline:
                raise RuntimeError("Timed out establishing real overlapping transactions")
            time.sleep(0.05)

    try:
        a = start(0, first)
        barrier(a, apps[0], "wait_event='PgSleep'")
        b = start(1, second)
        barrier(b, apps[1], "wait_event_type='Lock'")
        codes = [p.wait(timeout=20) for p in procs]
        errors = [p.stderr.read() for p in procs]
        if codes[0] != 0:
            raise RuntimeError("First transaction failed: " + errors[0][-1800:])
        if expect_second is None and codes[1] != 0:
            raise RuntimeError("Second transaction should have succeeded: " + errors[1][-1800:])
        if expect_second is not None and (codes[1] == 0 or expect_second not in errors[1]):
            raise RuntimeError("Wrong race outcome, expected " + expect_second + ": " + str(codes) + errors[1][-1800:])
    finally:
        for proc in procs:
            if proc.poll() is None:
                proc.kill()
                proc.wait()


def scalar(statement):
    return sql(statement).strip()


SETUP = """
select 'E1='||pg_temp.p5_raw('doctor','confirmed',now()-interval '20 hours');
select 'E2='||pg_temp.p5_raw('lab','in_progress',now()-interval '10 minutes','c1000000-0000-4000-8000-000000000002');
select 'E3='||pg_temp.p5_raw('caretaker','in_progress',now()-interval '10 minutes','c1000000-0000-4000-8000-000000000003');
select 'E4='||pg_temp.p5_raw('ambulance','confirmed',now()-interval '20 hours');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.open_exception(id,'eligibility_lapsed','other') from public.bookings where category='lab' and state='in_progress';
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select booking_private.open_exception(id,'eligibility_lapsed','other') from public.bookings where category='caretaker' and state='in_progress';
-- Lab and ambulance accepts stand in for their category commands in this scratch DB only.
update booking_private.category_paths set generic_accept=true where category in ('lab','ambulance');
select 'X='||pg_temp.p5_book('ambulance',pg_temp.p5_at(2),array['c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000003']::uuid[]);
select 'X2='||pg_temp.p5_book('ambulance',pg_temp.p5_at(2,2),array['c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004']::uuid[]);
select 'Y='||pg_temp.p5_create('lab',pg_temp.p5_at(5));
select 'Y2='||pg_temp.p5_create('lab',pg_temp.p5_at(5,2));
"""
SHIFT = """
select pg_temp.p5_shift(id,now()-interval '10 minutes') from public.bookings where category='ambulance' and state='confirmed' and start_at>now();
select pg_temp.p5_step(id,(select assigned_profile_id from public.booking_assignments a where a.booking_id=b.id and a.purpose='driver'),'in_progress','other')
 from public.bookings b where category='ambulance' and state='confirmed' and start_at<now() and start_at>now()-interval '1 hour';
"""


def concurrency():
    tests = ROOT / "supabase/tests"
    script = "begin;" + (tests / "_b01_fixture.inc").read_text() + (tests / "_p5s_fixture.inc").read_text() + SETUP + SHIFT + "commit;"
    out = sql(script)
    ids = dict(re.findall(r"^(E1|E2|E3|E4|X2|X|Y2|Y)=([0-9a-f-]{36})$", out, re.M))
    if len(ids) != 8:
        raise RuntimeError("Setup did not return every booking: " + str(sorted(ids)))
    print("PASS: synthetic P5 fixtures committed through the public staff-credential path", flush=True)

    close = "select public.ops_close_booking('{b}',{v},'interrupted','ops_closeout','{k}');"
    race(as_api(OPS) + close.format(b=ids["E1"], v=2, k=uuid.uuid4()),
         as_api(OPS_GLOBAL) + close.format(b=ids["E1"], v=2, k=uuid.uuid4()), "40001")
    if scalar("select count(*) from public.booking_events where booking_id='" + ids["E1"] + "' and to_state='interrupted';") != "1":
        raise RuntimeError("Two ops closes produced more than one closing event")
    print("PASS: two ops callers race one booking; one wins, the other 40001", flush=True)

    finish = "select 1 from public.bookings where id='{b}' for update;select booking_private.assignee_finish('{b}','completed','other','{k}');"
    race(as_command(W1) + finish.format(b=ids["E2"], k=uuid.uuid4()),
         as_api(OPS) + close.format(b=ids["E2"], v=2, k=uuid.uuid4()), "40001")
    if scalar("select state||':'||(select count(*) from public.booking_events e where e.booking_id=b.id and e.to_state in ('completed','interrupted')) from public.bookings b where id='" + ids["E2"] + "';") != "completed:1":
        raise RuntimeError("Assignee completion vs ops close did not commit exactly one terminal step")
    race(as_api(OPS) + close.format(b=ids["E3"], v=2, k=uuid.uuid4()),
         as_command(W2) + finish.format(b=ids["E3"], k=uuid.uuid4()), "55000")
    if scalar("select state||':'||(select count(*) from public.booking_events e where e.booking_id=b.id and e.to_state in ('completed','interrupted')) from public.bookings b where id='" + ids["E3"] + "';") != "interrupted:1":
        raise RuntimeError("Ops close vs assignee completion did not commit exactly one terminal step")
    print("PASS: ops close races assignee completion in both orders; exactly one terminal step commits", flush=True)

    key = uuid.uuid4()
    same = as_api(OPS) + close.format(b=ids["E4"], v=2, k=key)
    race(same, same, None)
    if scalar("select count(*) from public.booking_events where booking_id='" + ids["E4"] + "' and to_state='interrupted';") != "1" \
            or scalar("select count(*) from public.idempotency_requests where action='p5.ops.close' and request_key='" + str(key) + "';") != "1":
        raise RuntimeError("One key raced twice wrote more than one event or replay row")
    print("PASS: two calls with one key race; both return, exactly one event and one replay row", flush=True)

    lock = "select 1 from public.resources where id in ('{p}','{v}') order by id for update;"
    exception = lock + "select booking_private.assignee_finish('{b}','interrupted','unsafe_conditions','{k}');select booking_private.open_exception('{b}','interrupted_after_pickup','unsafe_conditions');"
    accept = "select public.accept_booking('{b}',2,array['{r}'::uuid]);"
    race(as_command(W1) + exception.format(p=R_W1, v=R_V1, b=ids["X"], k=uuid.uuid4()),
         as_api(M) + accept.format(b=ids["Y"], r=R_W1), "55000")
    if scalar("select state||':'||(select count(*) from public.booking_assignments a where a.booking_id=b.id) from public.bookings b where id='" + ids["Y"] + "';") != "requested:0":
        raise RuntimeError("Accept committed on a resource that was busy before its resource lock")
    race(as_api(M) + accept.format(b=ids["Y2"], r=R_W2),
         as_command(W2) + exception.format(p=R_W2, v=R_V2, b=ids["X2"], k=uuid.uuid4()), None)
    if scalar("select state from public.bookings where id='" + ids["Y2"] + "';") != "confirmed" \
            or scalar("select count(*) from public.booking_exceptions where booking_id='" + ids["X2"] + "' and status='open' and kind='interrupted_after_pickup';") != "1":
        raise RuntimeError("Accept-first order did not serialise with the exception")
    if scalar("select booking_private.resource_busy('" + R_W2 + "','" + ids["Y2"] + "')::text;") != "true":
        raise RuntimeError("Blocking exception opened after the accept does not mark the resource busy")
    print("PASS: blocking exception vs accept on one resource serialises on the resource lock in both orders", flush=True)


def main():
    base.assert_local_target()
    created = False
    try:
        schema = base.call(["exec", base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"], timeout=120)
        sql('create database "' + TARGET + '";', db="postgres")
        created = True
        sql(schema, user="supabase_admin")
        reset = "drop schema public cascade;drop schema if exists identity_private cascade;drop schema if exists providers_private cascade;drop schema if exists catalog_private cascade;drop schema if exists booking_private cascade;create schema public authorization postgres;grant usage on schema public to anon,authenticated,service_role;grant all on schema public to postgres,service_role;"
        reset += "do $$ declare p record;begin for p in select schemaname,tablename,policyname from pg_policies where schemaname='storage' and tablename in ('objects','buckets') loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);end loop;end $$;"
        sql(reset, user="supabase_admin")
        for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            sql(path.read_text())
        print("PASS: fresh replay of every migration through " + sorted((ROOT / "supabase/migrations").glob("*.sql"))[-1].name, flush=True)
        concurrency()
    finally:
        if created:
            assert re.fullmatch(r"p5s_engine_[0-9a-f]{12}", TARGET)
            sql('drop database "' + TARGET + '" with (force);', db="postgres")
            print("PASS: scratch database removed; source DB unchanged", flush=True)


if __name__ == "__main__":
    main()
