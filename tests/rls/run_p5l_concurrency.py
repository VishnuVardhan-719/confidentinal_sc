"""P5 lab races in a unique LOCAL scratch DB (design S9, S12.2; contract S6.5, S13.3).
Clones the local schema, replays every migration, commits the synthetic _b01/_p5s/_p5l
fixtures, then runs real overlapping transactions with deterministic lock barriers.
No source data, application-schema writes, resets or migrations in the source DB.
Authored for a teammate with Docker; not executed by its author (DB NOT EXECUTED).
Run: python tests/rls/run_p5l_concurrency.py
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
TARGET = "p5l_lab_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"p5l_lab_[0-9a-f]{12}", TARGET)
b01.TARGET = TARGET
base.TARGET = TARGET
sql = b01.sql
# Schema loads and suites can exceed the inherited 60 s per psql call on a busy Docker host.
base.call.__defaults__ = (None, 900)

PATIENT = "b1000000-0000-4000-8000-000000000001"
PATIENT_ID = "b2000000-0000-4000-8000-000000000001"
ADDRESS = "b5000000-0000-4000-8000-000000000001"
M = "c1000000-0000-4000-8000-000000000001"
W1 = "c1000000-0000-4000-8000-000000000002"
W2 = "c1000000-0000-4000-8000-000000000003"
OPS = "c1000000-0000-4000-8000-000000000005"
R_W1, R_W2 = "c6000000-0000-4000-8000-000000000001", "c6000000-0000-4000-8000-000000000002"
LAB_PROVIDER = "c3000000-0000-4000-8000-000000000002"
LAB_SERVICE = "c4100000-0000-4000-8000-000000000002"
# The first transaction holds its locks this long so the barrier, which polls through
# docker exec, sees the second one waiting even on a slow Docker host (as in run_b01).
HOLD_SECONDS = 20
TESTS = ROOT / "supabase/tests"


def claims(actor):
    return "select set_config('request.jwt.claims','" + json.dumps({"sub": actor, "aal": "aal2", "role": "authenticated"}) + "',true);"


def as_api(actor):
    """Run the following statements as the authenticated API role."""
    return "set local role authenticated;" + claims(actor)


def helpers():
    """pg_temp helpers only (no fixture rows), so each stage can build its own bookings."""
    text = (TESTS / "_tap_helpers.inc").read_text()
    for name in ("_p5s_fixture.inc", "_p5l_fixture.inc"):
        part = (TESTS / name).read_text().split("-- Helpers.", 1)
        if len(part) != 2:
            raise RuntimeError("Helper section not found in " + name)
        text += "\n--" + part[1]
    return text


def stage(setup, names):
    """Commit setup statements that print NAME=<uuid> lines; return {NAME: uuid}."""
    out = sql("begin;" + helpers() + setup + "commit;")
    ids = dict(re.findall(r"^([A-Z0-9_]+)=([0-9a-f-]{36})$", out, re.M))
    missing = [n for n in names if n not in ids]
    if missing:
        raise RuntimeError("Stage setup did not return " + str(missing))
    return ids


def race(first, second, expect_second, during=None):
    """first holds its locks (pg_sleep) while second blocks on a lock; then both finish.
    expect_second is None (second must succeed) or the SQLSTATE it must fail with."""
    apps = ["p5l_race_" + uuid.uuid4().hex[:10] for _ in range(2)]
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


def accept(booking, version, resource, key=None):
    return "select public.accept_lab_booking('" + booking + "'," + str(version) + ",'" + resource + "','" + str(key or uuid.uuid4()) + "');"


def advance(booking, step, version, key=None, failure=None):
    code = "null" if failure is None else "'" + failure + "'"
    return "select public.advance_lab_order('" + booking + "','" + step + "'," + str(version) + "," + code + ",'" + str(key or uuid.uuid4()) + "');"


def create(start_sql, key=None):
    return ("select public.create_lab_booking_request('" + PATIENT_ID + "','" + LAB_SERVICE + "','" + ADDRESS + "',"
            + start_sql + ",true,'" + str(key or uuid.uuid4()) + "');")


def version(booking):
    return int(scalar("select version from public.bookings where id='" + booking + "';"))


def terminal_events(booking):
    return scalar("select count(*) from public.booking_events where booking_id='" + booking + "' and to_state in ('completed','interrupted','no_show','cancelled');")


def concurrency():
    script = "begin;" + "".join((TESTS / n).read_text() for n in ("_tap_helpers.inc", "_b01_fixture.inc", "_p5s_fixture.inc", "_p5l_fixture.inc")) + "commit;"
    sql(script)
    print("PASS: synthetic P5 and lab fixtures committed through the public staff-credential and lab-test paths", flush=True)

    # 1. Two accepts of one booking with one version: one wins, the other 40001.
    ids = stage("select 'A1='||pg_temp.lab_create(pg_temp.p5_at(2));"
                "select 'A2='||pg_temp.lab_create(pg_temp.p5_at(3));select 'A3='||pg_temp.lab_create(pg_temp.p5_at(3,0.5));", ["A1", "A2", "A3"])
    race(as_api(M) + accept(ids["A1"], 2, R_W1), as_api(M) + accept(ids["A1"], 2, R_W2), "40001")
    if scalar("select count(*) from public.booking_assignments where booking_id='" + ids["A1"] + "';") != "1":
        raise RuntimeError("Double accept wrote more than one assignment")
    print("PASS: two accepts of one booking; one confirmed, one 40001, one assignment", flush=True)
    # Two bookings whose buffered periods overlap, one technician: exactly one commits (23P01).
    race(as_api(M) + accept(ids["A2"], 2, R_W1), as_api(M) + accept(ids["A3"], 2, R_W1), "23P01")
    if scalar("select count(*) from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id in ('"
              + ids["A2"] + "','" + ids["A3"] + "') and rr.status='active';") != "1":
        raise RuntimeError("Overlapping accepts reserved one technician twice")
    print("PASS: overlapping accepts for one technician; one reservation, the other 23P01", flush=True)

    # 2. Creates: one key raced twice returns one booking; overlapping requests serialise (MR-08).
    key = uuid.uuid4()
    start = "(date_trunc('day',now() at time zone 'Asia/Kolkata')+interval '6 days 10 hours') at time zone 'Asia/Kolkata'"
    same = as_api(PATIENT) + create(start, key)
    race(same, same, None)
    if scalar("select count(*) from public.idempotency_requests where action='lab.create' and request_key='" + str(key) + "';") != "1" \
            or scalar("select count(*) from public.lab_orders o join public.bookings b on b.id=o.booking_id where b.start_at=" + start + ";") != "1":
        raise RuntimeError("One create key raced twice wrote more than one booking or order")
    print("PASS: two creates with one key; both return, one booking, one order, one replay row", flush=True)
    other = "(date_trunc('day',now() at time zone 'Asia/Kolkata')+interval '7 days 10 hours') at time zone 'Asia/Kolkata'"
    overlap = "(date_trunc('day',now() at time zone 'Asia/Kolkata')+interval '7 days 10 hours 15 minutes') at time zone 'Asia/Kolkata'"
    race(as_api(PATIENT) + create(other), as_api(PATIENT) + create(overlap), "55000")
    print("PASS: overlapping lab requests race on the patient lock; the second gets 55000 overlapping_lab_request", flush=True)

    # 3. Cancel against start_collection: exactly one wins.
    ids = stage("select 'C1='||pg_temp.lab_live('" + R_W2 + "');", ["C1"])
    v = version(ids["C1"])
    race(as_api(M) + "select public.cancel_booking('" + ids["C1"] + "'," + str(v) + ",'provider_unavailable');",
         as_api(W2) + advance(ids["C1"], "start_collection", v), "42501")
    if scalar("select b.state||':'||o.substate from public.bookings b join public.lab_orders o on o.booking_id=b.id where b.id='" + ids["C1"] + "';") != "cancelled:scheduled":
        raise RuntimeError("Cancel/start race left the wrong state")
    print("PASS: cancel vs start_collection; cancel wins, start refused after the lock", flush=True)

    # 4. Two collected calls with one version; then one handoff key raced twice.
    ids = stage("select pg_temp.lab_live('" + R_W1 + "') as c2 \\gset\nselect pg_temp.lab_step(:'c2','" + W1 + "','start_collection');select 'C2='||:'c2';", ["C2"])
    v = version(ids["C2"])
    race(as_api(W1) + advance(ids["C2"], "collected", v), as_api(W1) + advance(ids["C2"], "collected", v), "40001")
    if scalar("select count(*) from public.booking_events where booking_id='" + ids["C2"] + "' and reason='sample_collected';") != "1":
        raise RuntimeError("Two collected calls wrote two events")
    print("PASS: two collected calls with one version; one event, the other 40001", flush=True)
    key = uuid.uuid4()
    same = as_api(W1) + advance(ids["C2"], "handed_over", v + 1, key)
    race(same, same, None)
    if terminal_events(ids["C2"]) != "1" \
            or scalar("select count(*) from public.idempotency_requests where action='p5.lab.advance' and request_key='" + str(key) + "';") != "1":
        raise RuntimeError("One handoff key raced twice wrote more than one event or replay row")
    print("PASS: one handoff key raced twice; both return, one event, one replay row", flush=True)

    # 5. Handoff against provider suspension: lock order holds, no deadlock; the handoff
    # waits on the provider row, then closes through closeout with closed_while_ineligible.
    ids = stage("select 'C4='||pg_temp.lab_collected('" + R_W2 + "');", ["C4"])
    v = version(ids["C4"])
    race("update public.providers set status='suspended' where id='" + LAB_PROVIDER + "';",
         as_api(W2) + advance(ids["C4"], "handed_over", v), None)
    sql("update public.providers set status='active' where id='" + LAB_PROVIDER + "';")
    if scalar("select state from public.bookings where id='" + ids["C4"] + "';") != "completed" \
            or scalar("select count(*) from public.booking_exceptions where booking_id='" + ids["C4"] + "' and kind='closed_while_ineligible';") != "1":
        raise RuntimeError("Handoff after suspension did not close through closeout")
    print("PASS: handoff waits on a provider suspension, then closes via closeout with one closed_while_ineligible", flush=True)

    # 6. Ops close against the technician's handoff, both orders: exactly one terminal step.
    ids = stage("select pg_temp.lab_collected('" + R_W1 + "') as c5 \\gset\nselect pg_temp.p5_shift(:'c5',now()-interval '14 hours');select 'C5='||:'c5';"
                "select pg_temp.lab_collected('" + R_W2 + "') as c6 \\gset\nselect pg_temp.p5_shift(:'c6',now()-interval '17 hours');select 'C6='||:'c6';", ["C5", "C6"])
    close = "select public.ops_close_booking('{b}',{v},'interrupted','ops_closeout','{k}');"
    v = version(ids["C5"])
    race(as_api(W1) + advance(ids["C5"], "handed_over", v), as_api(OPS) + close.format(b=ids["C5"], v=v, k=uuid.uuid4()), "40001")
    v = version(ids["C6"])
    race(as_api(OPS) + close.format(b=ids["C6"], v=v, k=uuid.uuid4()), as_api(W2) + advance(ids["C6"], "handed_over", v), "42501")
    if (scalar("select state from public.bookings where id='" + ids["C5"] + "';"), terminal_events(ids["C5"])) != ("completed", "1") \
            or (scalar("select state from public.bookings where id='" + ids["C6"] + "';"), terminal_events(ids["C6"])) != ("interrupted", "1"):
        raise RuntimeError("Ops close vs handoff did not commit exactly one terminal step")
    print("PASS: ops close vs technician handoff in both orders; exactly one terminal step", flush=True)


CRON = re.compile(r"^.*(\bpg_cron\b|\bcron\.|\bSCHEMA cron\b).*$", re.M | re.I)


def without_cron(text):
    """pg_cron can only live in the cron.database_name database (see 20261117001500 M2),
    so the scratch copy drops the extension and the 000670 job; nothing else changes."""
    return CRON.sub("-- pg_cron omitted in the scratch database", text)


def build():
    schema = base.call(["exec", base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"], timeout=180)
    sql('create database "' + TARGET + '";', db="postgres")
    sql(without_cron(schema), user="supabase_admin")
    # Every block's <name>_private/<name>_worker schema (doctor, lab, payments, ...), as the shared runners do.
    reset = "do $$ declare s text;begin for s in select nspname from pg_namespace where nspname like '%\\_private' or nspname like '%\\_worker' loop execute format('drop schema %I cascade',s);end loop;end $$;"
    reset += "drop schema public cascade;"
    for name in ("payments_private", "payments_worker", "lab_private", "identity_private", "providers_private", "catalog_private", "booking_private"):
        reset += "drop schema if exists " + name + " cascade;"
    reset += "create schema public authorization postgres;grant usage on schema public to anon,authenticated,service_role;grant all on schema public to postgres,service_role;"
    reset += "do $$ declare p record;begin for p in select schemaname,tablename,policyname from pg_policies where schemaname='storage' and tablename in ('objects','buckets') loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);end loop;end $$;"
    sql(reset, user="supabase_admin")
    paths = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    for path in paths:
        sql(without_cron(path.read_text()) if path.name.startswith("20261117000670_") else path.read_text())
    print("PASS: fresh replay of every migration through " + paths[-1].name, flush=True)


def drop():
    assert re.fullmatch(r"p5l_lab_[0-9a-f]{12}", TARGET)
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
