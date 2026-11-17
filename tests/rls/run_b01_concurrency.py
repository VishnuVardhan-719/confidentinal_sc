"""B01 migrations, SQL regressions and real races in a unique LOCAL scratch DB.
No source data, application-schema writes, resets or migrations in the source DB.
Run: python3 tests/rls/run_b01_concurrency.py [--red]
"""
import importlib.util
import json
import re
import subprocess
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("i01_runner", ROOT / "tests/rls/run_i01_followups.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
TARGET = "b01_booking_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"b01_booking_[0-9a-f]{12}", TARGET)
base.TARGET = TARGET
call = base.call


def sql(statement, db=None, user="postgres"):
    return base.sql(statement, db=db or TARGET, user=user)


def args(db=None, user="postgres"):
    return base.psql_args(db or TARGET, user)
PATIENT = "b1000000-0000-4000-8000-000000000001"
DOCTOR = "b1000000-0000-4000-8000-000000000002"
RESOURCE = "b6000000-0000-4000-8000-000000000001"


def claims(actor):
    return "select set_config('request.jwt.claims','" + json.dumps({"sub": actor, "role": "authenticated"}) + "',true);"


def create_request(day, minutes=0):
    out = sql("begin; set local role authenticated;" + claims(PATIENT)
              + "select public.create_booking_request('b2000000-0000-4000-8000-000000000001',"
              + "'b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',"
              + "date_trunc('day',now())+interval '" + str(day) + " days 4 hours " + str(minutes) + " minutes','" + str(uuid.uuid4()) + "'); commit;")
    ids = re.findall(r"^[0-9a-f-]{36}$", out, re.M)
    if len(ids) != 1:
        raise RuntimeError("Booking creation did not return exactly one UUID")
    return ids[0]


def accept(booking, version=2):
    return "select public.accept_booking('" + booking + "'," + str(version) + ",array['" + RESOURCE + "'::uuid]);"


def cancel(booking, version=2):
    return "select public.cancel_booking('" + booking + "'," + str(version) + ",'other');"


def race(first_actor, first, second_actor, second, expected_state):
    apps = ["b01_race_" + uuid.uuid4().hex[:10] for _ in range(2)]
    processes = []

    def start(index, actor, statement):
        text = "set application_name='" + apps[index] + "';begin;set local role authenticated;" + claims(actor) + statement
        text += ("select pg_sleep(5);" if index == 0 else "") + "commit;"
        proc = subprocess.Popen([base.DOCKER, *args(), "-v", "VERBOSITY=verbose"], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        processes.append(proc)
        proc.stdin.write(text)
        proc.stdin.close()
        return proc

    def barrier(proc, app, condition):
        deadline = time.monotonic() + 12
        while sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='" + app + "' and " + condition + ";").strip() != "1":
            if proc.poll() is not None:
                raise RuntimeError("Race failed before barrier: " + proc.stderr.read()[-1800:])
            if time.monotonic() > deadline:
                raise RuntimeError("Timed out establishing real overlapping transactions")
            time.sleep(0.05)

    try:
        a = start(0, first_actor, first)
        barrier(a, apps[0], "wait_event='PgSleep'")
        b = start(1, second_actor, second)
        barrier(b, apps[1], "wait_event_type='Lock'")
        results = [p.wait(timeout=15) for p in processes]
        errors = [p.stderr.read() for p in processes]
        if results[0] != 0 or results[1] == 0 or expected_state not in errors[1]:
            raise RuntimeError("Wrong race outcome: " + str(results) + str(errors)[-2500:])
    finally:
        for proc in processes:
            if proc.poll() is None:
                proc.kill()
                proc.wait()


def concurrency():
    suite = (ROOT / "tests/rls/b01_booking.sql").read_text()
    fixtures = suite.split("-- B01 FIXTURES START:", 1)[1].split("\n", 1)[1].split("-- B01 FIXTURES END", 1)[0]
    sql("begin;" + fixtures + "commit;")
    a, b = create_request(5), create_request(5)
    race(DOCTOR, accept(a), DOCTOR, accept(b), "23P01")
    count = sql("select count(*) from public.resource_reservations where resource_id='" + RESOURCE + "' and status='active';").strip()
    if count != "1":
        raise RuntimeError("Double booking prevention failed")
    print("PASS: two accepts overlap; one commits, one 23P01; exactly one reservation", flush=True)
    # Half-open adjacency: immediately adjacent service is valid on the same resource.
    adjacent = create_request(5, 30)
    sql("begin;set local role authenticated;" + claims(DOCTOR) + accept(adjacent) + "commit;")
    print("PASS: adjacent half-open intervals both accepted", flush=True)
    c = create_request(6)
    race(PATIENT, cancel(c), DOCTOR, accept(c), "40001")
    if sql("select state from public.bookings where id='" + c + "';").strip() != "cancelled":
        raise RuntimeError("Cancel/accept winner state incorrect")
    if sql("select count(*) from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id='" + c + "' and rr.status='active';").strip() != "0":
        raise RuntimeError("Cancelled booking retained reservation")
    print("PASS: concurrent cancel/accept; stale loser; cancelled booking has no reservation", flush=True)
    d = create_request(7)
    race(PATIENT, cancel(d), DOCTOR, cancel(d), "40001")
    if sql("select count(*) from public.booking_events where booking_id='" + d + "' and to_state='cancelled';").strip() != "1":
        raise RuntimeError("Concurrent cancels produced duplicate events")
    print("PASS: concurrent cancels create exactly one cancellation event", flush=True)


def main():
    base.assert_local_target()
    created = False
    try:
        schema = call(["exec", base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"])
        sql('create database "' + TARGET + '";', db="postgres")
        created = True
        sql(schema, user="supabase_admin")
        # Drop only cloned application schemas. Preserve managed Auth/Storage and
        # original owners. Remove cloned storage policies before replaying I01.
        reset = "drop schema public cascade;drop schema if exists identity_private cascade;drop schema if exists providers_private cascade;drop schema if exists catalog_private cascade;drop schema if exists booking_private cascade;create schema public authorization postgres;grant usage on schema public to anon,authenticated,service_role;grant all on schema public to postgres,service_role;"
        reset += "do $$ declare p record;begin for p in select schemaname,tablename,policyname from pg_policies where schemaname='storage' and tablename in ('objects','buckets') loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);end loop;end $$;"
        sql(reset, user="supabase_admin")
        for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            if "005" in path.name and "--red" in sys.argv:
                try:
                    sql((ROOT / "tests/rls/b01_booking.sql").read_text())
                except RuntimeError as error:
                    if "B01 schema exists" not in str(error):
                        raise
                    print("EXPECTED FAIL: B01 schema absent before migration 005", flush=True)
                    return
                raise RuntimeError("B01 suite unexpectedly passed without 005")
            sql(path.read_text())
            print("PASS: fresh migration " + path.name, flush=True)
        failures = []
        for name in ("i01_identity.sql", "i01_followups.sql", "i02_providers.sql", "c01_catalog.sql", "b01_booking.sql"):
            try:
                sql((ROOT / "tests/rls" / name).read_text())
            except RuntimeError as error:
                failures.append(name)
                print("FAIL: " + name + ": " + str(error)[-1800:], flush=True)
                continue
            print("PASS: " + name, flush=True)
        concurrency()
        if failures:
            raise RuntimeError("SQL regression suites failed: " + ", ".join(failures))
    finally:
        if created:
            assert re.fullmatch(r"b01_booking_[0-9a-f]{12}", TARGET)
            sql('drop database "' + TARGET + '" with (force);', db="postgres")
            print("PASS: scratch database removed; source DB unchanged", flush=True)


if __name__ == "__main__":
    main()
