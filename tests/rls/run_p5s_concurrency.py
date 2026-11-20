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
# Schema loads and suites can exceed the inherited 60 s per psql call on a busy Docker host.
base.call.__defaults__ = (None, 900)

PATIENT = "b1000000-0000-4000-8000-000000000001"
M = "c1000000-0000-4000-8000-000000000001"
W1 = "c1000000-0000-4000-8000-000000000002"
W2 = "c1000000-0000-4000-8000-000000000003"
OPS = "c1000000-0000-4000-8000-000000000005"
OPS_GLOBAL = "c1000000-0000-4000-8000-000000000006"
R_W1, R_W2 = "c6000000-0000-4000-8000-000000000001", "c6000000-0000-4000-8000-000000000002"
R_V1, R_V2 = "c6000000-0000-4000-8000-000000000003", "c6000000-0000-4000-8000-000000000004"


# The first transaction holds its locks this long so the barrier, which polls through
# docker exec, sees the second one waiting even on a slow Docker host (as in run_b01).
HOLD_SECONDS = 20


def claims(actor):
    return "select set_config('request.jwt.claims','" + json.dumps({"sub": actor, "aal": "aal2", "role": "authenticated"}) + "',true);"


def as_api(actor):
    """Run the following statements as the authenticated API role."""
    return "set local role authenticated;" + claims(actor)


def as_command(actor):
    """Run private engine helpers as a category command would: definer owner, caller's claims."""
    return "reset role;" + claims(actor)


def race(first, second, expect_second, during=None):
    """first holds its locks (pg_sleep) while second blocks on a lock; then both finish.
    expect_second is None (second must succeed) or the SQLSTATE it must fail with.
    during() runs (autocommit) after second is seen waiting, before first commits.
    Returns the second session's stderr."""
    apps = ["p5s_race_" + uuid.uuid4().hex[:10] for _ in range(2)]
    procs = []

    def start(index, statement):
        text = "set application_name='" + apps[index] + "';begin;" + statement
        text += ("select pg_sleep(" + str(HOLD_SECONDS) + ");" if index == 0 else "") + "commit;"
        proc = subprocess.Popen([base.DOCKER, *b01.args(), "-v", "VERBOSITY=verbose"], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        procs.append(proc)
        proc.stdin.write(text)
        proc.stdin.close()
        return proc

    def barrier(proc, app, condition):
        deadline = time.monotonic() + HOLD_SECONDS + 7
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
        if during:
            during()
        codes = [p.wait(timeout=HOLD_SECONDS + 60) for p in procs]
        errors = [p.stderr.read() for p in procs]
        if codes[0] != 0:
            raise RuntimeError("First transaction failed: " + errors[0][-1800:])
        if expect_second is None and codes[1] != 0:
            raise RuntimeError("Second transaction should have succeeded: " + errors[1][-1800:])
        if expect_second is not None and (codes[1] == 0 or expect_second not in errors[1]):
            raise RuntimeError("Wrong race outcome, expected " + expect_second + ": " + str(codes) + errors[1][-1800:])
        return errors[1]
    finally:
        for proc in procs:
            if proc.poll() is None:
                proc.kill()
                proc.wait()


def scalar(statement):
    return sql(statement).strip()


SETUP = r"""
select pg_temp.p5_raw('doctor','confirmed',now()-interval '20 hours') as e1 \gset
select pg_temp.p5_raw('lab','in_progress',now()-interval '10 minutes','c1000000-0000-4000-8000-000000000002') as e2 \gset
select pg_temp.p5_raw('caretaker','in_progress',now()-interval '10 minutes','c1000000-0000-4000-8000-000000000003') as e3 \gset
select pg_temp.p5_raw('ambulance','confirmed',now()-interval '20 hours') as e4 \gset
-- Open exceptions make the in-progress bookings escalatable for ops.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.open_exception(:'e2','eligibility_lapsed','other');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select booking_private.open_exception(:'e3','eligibility_lapsed','other');
-- Lab and ambulance accepts stand in for their category commands in this scratch DB only.
update booking_private.category_paths set generic_accept=true where category in ('lab','ambulance');
select pg_temp.p5_book('ambulance',pg_temp.p5_at(2),array['c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000003']::uuid[]) as x \gset
select pg_temp.p5_book('ambulance',pg_temp.p5_at(2,2),array['c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004']::uuid[]) as x2 \gset
select pg_temp.p5_create('lab',pg_temp.p5_at(5)) as y \gset
select pg_temp.p5_create('lab',pg_temp.p5_at(5,2)) as y2 \gset
select pg_temp.p5_create('doctor',pg_temp.p5_at(6)) as g1 \gset
select pg_temp.p5_create('doctor',pg_temp.p5_at(6,2)) as g2 \gset
select pg_temp.p5_raw('lab','confirmed',now()+interval '1 day','c1000000-0000-4000-8000-000000000002') as e5 \gset
select pg_temp.p5_raw('lab','confirmed',now()+interval '1 day','c1000000-0000-4000-8000-000000000003') as e6 \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.open_exception(:'e5','eligibility_lapsed','other') as ex5 \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select booking_private.open_exception(:'e6','eligibility_lapsed','other') as ex6 \gset
-- The scheduler may manage memberships in this scratch DB, for the membership races.
update public.organization_members set scopes=scopes||array['members:read'] where profile_id='c1000000-0000-4000-8000-000000000001' and organization_id='c8000000-0000-4000-8000-000000000001';
select pg_temp.p5_shift(:'x',now()-interval '10 minutes');
select pg_temp.p5_shift(:'x2',now()-interval '10 minutes');
select pg_temp.p5_step(:'x','c1000000-0000-4000-8000-000000000002','in_progress','other');
select pg_temp.p5_step(:'x2','c1000000-0000-4000-8000-000000000003','in_progress','other');
select 'E1='||:'e1'; select 'E2='||:'e2'; select 'E3='||:'e3'; select 'E4='||:'e4';
select 'X='||:'x'; select 'X2='||:'x2'; select 'Y='||:'y'; select 'Y2='||:'y2';
select 'G1='||:'g1'; select 'G2='||:'g2'; select 'EX5='||:'ex5'; select 'EX6='||:'ex6';
"""

def concurrency():
    tests = ROOT / "supabase/tests"
    script = "begin;" + (tests / "_b01_fixture.inc").read_text() + (tests / "_p5s_fixture.inc").read_text() + SETUP + "commit;"
    out = sql(script)
    ids = dict(re.findall(r"^(E1|E2|E3|E4|X2|X|Y2|Y|G1|G2|EX5|EX6)=([0-9a-f-]{36})$", out, re.M))
    if len(ids) != 12:
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

    # Review H1: a gate switched off or suspended while accept waits on a resource is seen.
    for booking, state in ((ids["G1"], "off"), (ids["G2"], "suspended")):
        err = race("select 1 from public.resources where id='" + R_W1 + "' for update;",
                   as_api(M) + accept.format(b=booking, r=R_W1), "55000",
                   during=lambda s=state: sql("update booking_private.feature_gates set state='" + s + "' where key='doctor';"))
        sql("update booking_private.feature_gates set state='on' where key='doctor';")
        if "feature_unavailable" not in err:
            raise RuntimeError("Accept under a " + state + " gate failed for the wrong reason: " + err[-800:])
        if scalar("select state||':'||(select count(*) from public.booking_assignments a where a.booking_id=b.id) from public.bookings b where id='" + booking + "';") != "requested:0":
            raise RuntimeError("Accept wrote work after the gate went " + state)
    print("PASS: accept waiting on a resource sees the gate go off or suspended; nothing written", flush=True)

    # Review H2: exception resolution serialises with membership changes on the organisation lock.
    org = "c8000000-0000-4000-8000-000000000001"
    invite = "select public.set_organization_member('" + org + "','{p}','staff','invited','{{}}'::text[],0);"
    resolve = "select public.ops_resolve_exception('{e}',1,'resolved','{k}');"
    race(as_api(M) + invite.format(p=OPS), as_api(OPS) + resolve.format(e=ids["EX5"], k=uuid.uuid4()), "42501")
    if scalar("select status from public.booking_exceptions where id='" + ids["EX5"] + "';") != "open":
        raise RuntimeError("Resolution committed by an actor who became a member first")
    race(as_api(OPS_GLOBAL) + resolve.format(e=ids["EX6"], k=uuid.uuid4()), as_api(M) + invite.format(p=OPS_GLOBAL), None)
    if scalar("select status||':'||resolved_by_profile_id from public.booking_exceptions where id='" + ids["EX6"] + "';") != "resolved:" + OPS_GLOBAL:
        raise RuntimeError("Resolution before the membership change was not kept")
    print("PASS: ops resolution vs membership invite serialises on the organisation lock in both orders", flush=True)


CRON = re.compile(r"^.*(\bpg_cron\b|\bcron\.|\bSCHEMA cron\b).*$", re.M | re.I)


def without_cron(text):
    """pg_cron can only live in the cron.database_name database (see 20261117001500 M2),
    so the scratch copy drops the extension and the 000670 job; nothing else changes."""
    return CRON.sub("-- pg_cron omitted in the scratch database", text)


def build():
    schema = base.call(["exec", base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"], timeout=180)
    sql('create database "' + TARGET + '";', db="postgres")
    sql(without_cron(schema), user="supabase_admin")
    # Every block's <name>_private/<name>_worker schema, so new blocks need no edit here.
    reset = "do $$ declare s text;begin for s in select nspname from pg_namespace where nspname like '%\\_private' or nspname like '%\\_worker' loop execute format('drop schema %I cascade',s);end loop;end $$;"
    reset += "drop schema public cascade;drop schema if exists identity_private cascade;drop schema if exists providers_private cascade;drop schema if exists catalog_private cascade;drop schema if exists booking_private cascade;create schema public authorization postgres;grant usage on schema public to anon,authenticated,service_role;grant all on schema public to postgres,service_role;"
    reset += "do $$ declare p record;begin for p in select schemaname,tablename,policyname from pg_policies where schemaname='storage' and tablename in ('objects','buckets') loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);end loop;end $$;"
    sql(reset, user="supabase_admin")
    paths = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    for path in paths:
        sql(without_cron(path.read_text()) if path.name.startswith("20261117000670_") else path.read_text())
    print("PASS: fresh replay of every migration through " + paths[-1].name, flush=True)


def drop():
    assert re.fullmatch(r"p5s_engine_[0-9a-f]{12}", TARGET)
    sql('drop database if exists "' + TARGET + '" with (force);', db="postgres", user="supabase_admin")
    print("PASS: scratch database removed; source DB unchanged", flush=True)


def main():
    base.assert_local_target()
    try:
        build()
        concurrency()
    finally:
        drop()


if __name__ == "__main__":
    main()