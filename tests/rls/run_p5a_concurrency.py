"""P5 ambulance races in a unique LOCAL scratch DB (design §11.2; contract §11.4, §13.3).
Clones the local schema, replays every migration, commits the synthetic _b01/_p5s/_p5a
fixtures, then runs real overlapping transactions with deterministic lock barriers.
No source data, application-schema writes, resets or migrations in the source DB.
Authored, NOT EXECUTED (no Docker on the authoring machine).
Run: python tests/rls/run_p5a_concurrency.py
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
TARGET = "p5a_ambulance_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"p5a_ambulance_[0-9a-f]{12}", TARGET)
b01.TARGET = TARGET
base.TARGET = TARGET
sql = b01.sql
# Schema loads and fixtures can exceed the inherited 60 s per psql call on a busy Docker host.
base.call.__defaults__ = (None, 900)

M = "c1000000-0000-4000-8000-000000000001"
W1 = "c1000000-0000-4000-8000-000000000002"
W2 = "c1000000-0000-4000-8000-000000000003"
SUSPENDER = "c1000000-0000-4000-8000-000000000009"
PROVIDER = "c3000000-0000-4000-8000-000000000003"
R_W1, R_W2 = "c6000000-0000-4000-8000-000000000001", "c6000000-0000-4000-8000-000000000002"
R_V1, R_V2 = "c6000000-0000-4000-8000-000000000003", "c6000000-0000-4000-8000-000000000004"
HOLD_SECONDS = 20
# Application schemas a scratch clone must drop before replaying every migration.
APP_SCHEMAS = ("public", "identity_private", "providers_private", "catalog_private", "booking_private",
               "payments_private", "payments_worker", "ambulance_private")


def claims(actor):
    return "select set_config('request.jwt.claims','" + json.dumps({"sub": actor, "aal": "aal2", "role": "authenticated"}) + "',true);"


def as_api(actor):
    """Run the following statements as the authenticated API role."""
    return "set local role authenticated;" + claims(actor)


def race(first, second, expect_second):
    """first holds its locks (pg_sleep) while second blocks on a lock; then both finish.
    expect_second is None (second must succeed) or the SQLSTATE it must fail with."""
    apps = ["p5a_race_" + uuid.uuid4().hex[:10] for _ in range(2)]
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
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('c1000000-0000-4000-8000-000000000009','provider:suspend','global','b1000000-0000-4000-8000-000000000004');
select pg_temp.amb_request(pg_temp.p5_at(2)) as b1 \gset
select pg_temp.amb_request(pg_temp.p5_at(2)+interval '30 minutes') as b2 \gset
select pg_temp.amb_trip(pg_temp.p5_at(3),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as x \gset
select pg_temp.amb_trip(pg_temp.p5_at(3,2)) as y \gset
select pg_temp.amb_live(:'x');
select pg_temp.amb_live(:'y');
select pg_temp.amb_step(:'y','en_route');
select pg_temp.amb_step(:'y','arrived');
select pg_temp.amb_request(pg_temp.p5_at(4)) as b7 \gset
select pg_temp.amb_request(pg_temp.p5_at(5)) as b8 \gset
select pg_temp.amb_request(pg_temp.p5_at(6)) as b5 \gset
select pg_temp.amb_request(pg_temp.p5_at(7)) as b6 \gset
select 'B1='||:'b1'; select 'B2='||:'b2'; select 'X='||:'x'; select 'Y='||:'y';
select 'B5='||:'b5'; select 'B6='||:'b6'; select 'B7='||:'b7'; select 'B8='||:'b8';
"""


def accept(booking, driver, vehicle, version=2):
    return ("select public.accept_transport('" + booking + "'," + str(version) + ",'" + driver + "','" + vehicle
            + "','" + str(uuid.uuid4()) + "');")


def advance(booking, step, version, key=None):
    return "select public.advance_trip('" + booking + "','" + step + "'," + str(version) + ",'" + str(key or uuid.uuid4()) + "');"


def concurrency():
    tests = ROOT / "supabase/tests"
    script = "begin;" + "".join((tests / name).read_text() for name in ("_b01_fixture.inc", "_p5s_fixture.inc", "_p5a_fixture.inc")) + SETUP + "commit;"
    out = sql(script)
    ids = dict(re.findall(r"^(B1|B2|B5|B6|B7|B8|X|Y)=([0-9a-f-]{36})$", out, re.M))
    if len(ids) != 8:
        raise RuntimeError("Setup did not return every booking: " + str(sorted(ids)))
    print("PASS: synthetic P5 ambulance fixtures committed through the public fleet path", flush=True)

    # 1. Two accepts whose buffered reservations overlap on one vehicle: one wins, 23P01.
    race(as_api(M) + accept(ids["B1"], R_W1, R_V1), as_api(M) + accept(ids["B2"], R_W2, R_V1), "23P01")
    if scalar("select count(*) from public.resource_reservations where resource_id='" + R_V1 + "' and status='active';") != "1" \
            or scalar("select state||':'||(select count(*) from public.booking_assignments a where a.booking_id=b.id) from public.bookings b where id='" + ids["B2"] + "';") != "requested:0":
        raise RuntimeError("Overlapping vehicle accepts did not leave exactly one reservation")
    print("PASS: overlapping accepts on one vehicle; one commits, one 23P01, nothing written by the loser", flush=True)

    # 2. en_route racing cancel on the same version: en_route wins, cancel is stale.
    race(as_api(W2) + advance(ids["X"], "en_route", 4), as_api(M) + "select public.cancel_booking('" + ids["X"] + "',4,'provider_unavailable');", "40001")
    if scalar("select b.state||'/'||t.substate from public.bookings b join public.transport_trips t on t.booking_id=b.id where b.id='" + ids["X"] + "';") != "confirmed/en_route":
        raise RuntimeError("Cancel/en_route winner state incorrect")
    print("PASS: en_route vs cancel on one version; one wins, the loser 40001", flush=True)

    # 3. Two pickups on the same version with different keys: one event.
    race(as_api(W1) + advance(ids["Y"], "picked_up", 6), as_api(W1) + advance(ids["Y"], "picked_up", 6), "40001")
    if scalar("select count(*) from public.booking_events where booking_id='" + ids["Y"] + "' and reason='picked_up';") != "1":
        raise RuntimeError("Concurrent pickups wrote more than one event")
    print("PASS: two pickups race; one event, the loser 40001", flush=True)

    # 4. One key raced twice: both return, one event and one replay row.
    key = uuid.uuid4()
    same = as_api(W1) + advance(ids["Y"], "destination_reached", 7, key)
    race(same, same, None)
    if scalar("select count(*) from public.booking_events where booking_id='" + ids["Y"] + "' and reason='destination_reached';") != "1" \
            or scalar("select count(*) from public.idempotency_requests where action='p5.ambulance.advance' and request_key='" + str(key) + "';") != "1":
        raise RuntimeError("One key raced twice wrote more than one event or replay row")
    print("PASS: same key raced twice; one event, one replay row, both callers answered", flush=True)

    # 5. Roster disable vs accept, both orders, serialised on the organisation/provider lock.
    disable = "select public.set_ambulance_driver('" + PROVIDER + "','{r}','{s}',{v});"
    race(as_api(M) + disable.format(r=R_W2, s="disabled", v=1), as_api(M) + accept(ids["B7"], R_W2, R_V1), "55000")
    sql("begin;" + as_api(M) + disable.format(r=R_W2, s="active", v=2) + "commit;")
    race(as_api(M) + accept(ids["B8"], R_W1, R_V1), as_api(M) + disable.format(r=R_W1, s="disabled", v=1), "40001")
    if scalar("select state from public.bookings where id='" + ids["B8"] + "';") != "confirmed" \
            or scalar("select status from public.ambulance_drivers where resource_id='" + R_W1 + "';") != "active":
        raise RuntimeError("Accept-first order did not keep the driver on the roster")
    print("PASS: roster disable vs accept in both orders; never an accepted trip with a driver disabled first", flush=True)

    # 6. Vehicle suspension vs accept, both orders.
    review = "select public.review_vehicle_case('{r}','suspended','Synthetic suspension',{v});"
    race(as_api(M) + accept(ids["B5"], R_W2, R_V2), as_api(SUSPENDER) + review.format(r=R_V2, v=7), None)
    if scalar("select state from public.bookings where id='" + ids["B5"] + "';") != "confirmed" \
            or scalar("select case_state from public.ambulance_vehicles where resource_id='" + R_V2 + "';") != "suspended":
        raise RuntimeError("Accept-first order did not serialise with the suspension")
    race(as_api(SUSPENDER) + review.format(r=R_V1, v=7), as_api(M) + accept(ids["B6"], R_W1, R_V1), "55000")
    if scalar("select state||':'||(select count(*) from public.booking_assignments a where a.booking_id=b.id) from public.bookings b where id='" + ids["B6"] + "';") != "requested:0":
        raise RuntimeError("Accept committed on a vehicle suspended before its lock")
    print("PASS: vehicle suspension vs accept in both orders; never an accepted trip on a vehicle suspended first", flush=True)


CRON = re.compile(r"^.*(\bpg_cron\b|\bcron\.|\bSCHEMA cron\b).*$", re.M | re.I)


def without_cron(text):
    """pg_cron lives only in cron.database_name (20261117001500 M2); the scratch copy omits it."""
    return CRON.sub("-- pg_cron omitted in the scratch database", text)


def build():
    schema = base.call(["exec", base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"], timeout=180)
    sql('create database "' + TARGET + '";', db="postgres")
    sql(without_cron(schema), user="supabase_admin")
    reset = "".join("drop schema if exists " + s + " cascade;" for s in APP_SCHEMAS)
    reset += "create schema public authorization postgres;grant usage on schema public to anon,authenticated,service_role;grant all on schema public to postgres,service_role;"
    reset += "do $$ declare p record;begin for p in select schemaname,tablename,policyname from pg_policies where schemaname='storage' and tablename in ('objects','buckets') loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);end loop;end $$;"
    sql(reset, user="supabase_admin")
    paths = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    for path in paths:
        sql(without_cron(path.read_text()) if path.name.startswith("20261117000670_") else path.read_text())
    print("PASS: fresh replay of every migration through " + paths[-1].name, flush=True)


def drop():
    assert re.fullmatch(r"p5a_ambulance_[0-9a-f]{12}", TARGET)
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
