"""P01a real two-connection races on disposable LOCAL scratch databases.

No Docker lifecycle or Supabase reset. Requires the shared block already merged,
an explicitly approved running local stack, and the common 30-minute DB lock.
Run only after Claude's 'shared merged' signal:
  python tests/rls/run_p01_concurrency.py --execute --shared-merged
Without both switches this program performs no DB operation (including imports
of the legacy runner, which checks for Docker at import time).
"""
import argparse
import importlib.util
import json
import os
import re
import subprocess
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATIENT = "b1000000-0000-4000-8000-000000000001"
COLLECTOR = "c1000000-0000-4000-8000-000000000002"
FINANCE = "d1000000-0000-4000-8000-000000000001"
LOCK = Path("C:/tmp/scv_logs/db.lock")


@contextmanager
def database_lock():
    """Exclusive-create the shared lock; never steal one younger than 30 min."""
    marker = "codex-p01-sql " + str(time.time()) + " " + uuid.uuid4().hex
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            stat = LOCK.stat()
            if time.time() - stat.st_mtime < 1800:
                print("DB lock busy; waiting (no database operation).", flush=True)
                time.sleep(10)
                continue
            # Only remove the exact stale file inspected, never a renewed lock.
            if LOCK.stat().st_mtime_ns == stat.st_mtime_ns:
                LOCK.unlink()
            continue
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(marker)
        break
    try:
        yield
    finally:
        if LOCK.exists() and LOCK.read_text(encoding="utf-8") == marker:
            LOCK.unlink()


def claims(actor):
    return "select set_config('request.jwt.claims','" + json.dumps(
        {"sub": actor, "role": "authenticated", "aal": "aal2"}
    ) + "',true);"


def load_b01():
    spec = importlib.util.spec_from_file_location("p01_b01", ROOT / "tests/rls/run_b01_concurrency.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture_text():
    return "\n".join((ROOT / "supabase/tests" / name).read_text(encoding="utf-8") for name in
                     ("_tap_helpers.inc", "_b01_fixture.inc", "_p5s_fixture.inc", "_p01_fixture.inc"))


def parallel(b01, db, actor_a, first, actor_b, second, loser_state=None, owner_a=False):
    """A observes B waiting *inside PostgreSQL* and commits immediately.

    This proves real overlap without a 20-second external barrier that would
    exceed P01's intentional 3-second function lock_timeout. Import B01's
    local-target/psql helpers; do not reuse its incompatible fixed hold delay.
    """
    app_b = "p01_loser_" + uuid.uuid4().hex[:10]
    procs = []
    try:
        prefix = "begin;" + ("" if owner_a else "set local role authenticated;") + claims(actor_a)
        barrier = """
do $barrier$ declare deadline timestamptz:=clock_timestamp()+interval '60 seconds'; begin
 loop
  perform pg_stat_clear_snapshot();
  exit when exists(select 1 from pg_stat_activity where application_name='%s' and wait_event_type='Lock');
  if clock_timestamp()>deadline then raise exception 'P01 overlap barrier timed out'; end if;
  perform pg_sleep(0.01);
 end loop;
end $barrier$;
select 'OVERLAP_OBSERVED'; commit;
""" % app_b
        proc_a = subprocess.Popen([b01.base.DOCKER, *b01.args(db), "-v", "VERBOSITY=verbose"],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        procs.append(proc_a)
        # Monitoring runs as the original owner. An authenticated effective role
        # cannot see wait_event_type on a backend logged in as postgres.
        proc_a.stdin.write(prefix + first + "reset role;select 'FIRST_READY';" + barrier)
        proc_a.stdin.close()
        # psql flushes query results; A then waits inside the bounded DB barrier.
        while True:
            line = proc_a.stdout.readline()
            if line.strip() == "FIRST_READY":
                break
            if not line:
                raise RuntimeError("First race command failed: " + proc_a.stderr.read()[-1800:])
        text_b = "set application_name='" + app_b + "';begin;set local role authenticated;" + claims(actor_b) + second + "commit;"
        proc_b = subprocess.Popen([b01.base.DOCKER, *b01.args(db), "-v", "VERBOSITY=verbose"],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        procs.append(proc_b)
        out_b, err_b = proc_b.communicate(text_b, timeout=30)
        code_a = proc_a.wait(timeout=65)
        out_a, err_a = proc_a.stdout.read(), proc_a.stderr.read()
        if code_a or "OVERLAP_OBSERVED" not in out_a:
            raise RuntimeError("First transaction/barrier failed: " + err_a[-1800:])
        if loser_state:
            if proc_b.returncode == 0 or loser_state not in err_b:
                raise RuntimeError("Wrong losing SQLSTATE: " + err_b[-1800:])
        elif proc_b.returncode:
            raise RuntimeError("Expected both transactions to succeed: " + err_b[-1800:])
        return out_b
    finally:
        for proc in procs:
            if proc.poll() is None:
                proc.kill()
                proc.wait()


def run_case(b01, template, number, name, setup, actor_a, first, actor_b, second, expected, invariant, owner_a=False):
    db = template + "_" + str(number)
    assert re.fullmatch(r"p01_pay_after_[0-9a-f]{12}_[0-9]+", db)
    b01.sql('create database "' + db + '" template "' + template + '";', db="postgres")
    try:
        output = b01.sql("begin;" + fixture_text() + setup + "commit;", db=db)
        match = re.findall(r"^CASE:(.*)$", output, re.M)
        if len(match) != 1:
            raise RuntimeError("Fixture did not return exactly one case payload")
        values = json.loads(match[0])
        parallel(b01, db, actor_a, first.format(**values), actor_b, second.format(**values), expected, owner_a)
        if b01.sql(invariant.format(**values), db=db).strip() != "t":
            raise RuntimeError("Race invariant failed: " + name)
        print("PASS: " + name, flush=True)
    finally:
        b01.sql('drop database "' + db + '" with (force);', db="postgres")


def races(b01, template):
    setup = """
do $$ declare b uuid:=pg_temp.p01_book(); c uuid; begin
 perform pg_temp.p01_finance();
 c:=pg_temp.p01_report(b,10000);
 create temp table p01_case(b uuid,c uuid,v integer,k uuid);
 insert into p01_case values(b,c,pg_temp.p01_version(b),gen_random_uuid());
end $$;
select 'CASE:'||json_build_object('b',b,'c',c,'v',v,'k',k)::text from p01_case;
"""
    report = "select public.report_collection('{b}',30000,'cash',null,'{k}');"
    inv = "select (select count(*)=2 from public.payment_collections where payment_id=p.id) and p.confirmed_paise=0 from public.payments p where booking_id='{b}';"
    run_case(b01, template, 1, "over-collection reports serialize", setup, COLLECTOR, report, COLLECTOR,
             "select public.report_collection('{b}',30000,'cash',null,gen_random_uuid());", "22023", inv)
    reconcile = "select public.reconcile_collection('{c}','confirm','other',{v},'{k}');"
    confirmed = "select confirmed_paise=10000 and state='due' from public.payments where booking_id='{b}';"
    run_case(b01, template, 2, "two reconciles: stale loser and exact confirmed sum", setup, FINANCE, reconcile, FINANCE,
             "select public.reconcile_collection('{c}','confirm','other',{v},gen_random_uuid());", "40001", confirmed)
    run_case(b01, template, 3, "reconcile versus collector void", setup, FINANCE, reconcile, COLLECTOR,
             "select public.void_collection('{c}',{v},'correction',gen_random_uuid());", "40001", confirmed)
    run_case(b01, template, 4, "same collection request key: both return, one new row", setup, COLLECTOR, report, COLLECTOR,
             report, None, inv)
    cancelled_setup = """
select 'CASE:'||json_build_object('b',pg_temp.p5_book('doctor',clock_timestamp()+interval '1 minute',
 array['c6000000-0000-4000-8000-000000000001']::uuid[]),'k',gen_random_uuid())::text;
"""
    run_case(b01, template, 5, "pre-service cancellation versus unauthorized report", cancelled_setup, PATIENT,
             "select public.cancel_booking('{b}',4,'other');", COLLECTOR, report, "42501",
             "select state='voided' and not exists(select 1 from public.payment_collections where payment_id=p.id) from public.payments p where booking_id='{b}';")
    interrupted_setup = "select 'CASE:'||json_build_object('b',pg_temp.p01_book(false),'k',gen_random_uuid())::text;"
    run_case(b01, template, 6, "guard-preserving interruption versus report", interrupted_setup, COLLECTOR,
             "select booking_private.assignee_finish('{b}','interrupted','other',gen_random_uuid());", COLLECTOR, report, None,
             "select state='due' and report_deadline is not null and (select count(*)=1 from public.payment_collections where payment_id=p.id) from public.payments p where booking_id='{b}';", True)
    intake_setup = """
do $$ declare b uuid:=pg_temp.p01_book(); begin
 perform pg_temp.p01_suspend(); create temp table p01_case(b uuid); insert into p01_case values(b);
end $$;
select 'CASE:'||json_build_object('b',b,'k',gen_random_uuid())::text from p01_case;
"""
    intake = "select public.report_collection_exception('{b}',30000,'cash',null,'{k}');"
    hold = "select state='disputed' and confirmed_paise=0 and (select count(*)=1 from payments_private.collection_intakes where payment_id=p.id and status='pending') from public.payments p where booking_id='{b}';"
    run_case(b01, template, 7, "parallel intakes enforce one pending and balance", intake_setup, COLLECTOR, intake, COLLECTOR,
             "select public.report_collection_exception('{b}',30000,'cash',null,gen_random_uuid());", "53300", hold)
    run_case(b01, template, 8, "intake versus report across reinstatement reserves once", intake_setup, COLLECTOR,
             intake + "update public.providers set status='active' where id='c3000000-0000-4000-8000-000000000001';", COLLECTOR,
             report, "22023", hold, True)


def worker_race(b01, template):
    """A retains the worker advisory lock while B (service_role) tries it."""
    db = template + "_9"
    assert re.fullmatch(r"p01_pay_after_[0-9a-f]{12}_9", db)
    b01.sql('create database "' + db + '" template "' + template + '";', db="postgres")
    proc = None
    try:
        setup = """
do $$ declare b uuid; begin
 b:=pg_temp.p01_book(); perform public.report_collection(b,1,'upi_direct','123456789012',gen_random_uuid());
 b:=pg_temp.p01_book(true,'c1000000-0000-4000-8000-000000000003'); perform public.report_collection(b,1,'upi_direct','123456789012',gen_random_uuid());
 update payments_private.worker_cursor set phase='collections';
end $$;
"""
        b01.sql("begin;" + fixture_text() + setup + "commit;", db=db)
        proc = subprocess.Popen([b01.base.DOCKER, *b01.args(db)], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        proc.stdin.write("begin;set local role service_role;select payments_worker.reconcile_pay_after(200);select 'FIRST_READY';\n")
        proc.stdin.flush()
        while True:
            line = proc.stdout.readline()
            if line.strip() == "FIRST_READY":
                break
            if not line:
                raise RuntimeError("Worker A failed: " + proc.stderr.read()[-1800:])
        output = b01.sql("begin;set local role service_role;select 'WORKER_ZERO:'||payments_worker.reconcile_pay_after(200);commit;", db=db)
        if "WORKER_ZERO:0" not in output:
            raise RuntimeError("Concurrent worker did not yield to existing lease")
        proc.stdin.write("commit;\n")
        proc.stdin.close()
        if proc.wait(timeout=30):
            raise RuntimeError("Worker A failed to commit: " + proc.stderr.read()[-1800:])
        if b01.sql("select count(*)=2 and count(*)=count(distinct dedupe_key) from public.payment_exceptions where kind='duplicate_upi_reference';", db=db).strip() != "t":
            raise RuntimeError("Workers lost or duplicated duplicate-UTR exceptions")
        print("PASS: concurrent worker uses exclusive lease and deduplicates exceptions", flush=True)
    finally:
        if proc is not None and proc.poll() is None:
            proc.kill()
            proc.wait()
        b01.sql('drop database "' + db + '" with (force);', db="postgres")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--shared-merged", action="store_true")
    options = parser.parse_args()
    if not (options.execute and options.shared_merged):
        parser.error("No DB operation: --execute and --shared-merged are both required after Claude's signal")
    required = ROOT / "supabase/migrations/20261117001590_p5s_admission.sql"
    if not required.exists() or not (ROOT / "supabase/tests/_p5s_fixture.inc").exists():
        raise SystemExit("Shared engine/fixture not present in this branch; merge first")
    b01 = load_b01()
    template = "p01_pay_after_" + uuid.uuid4().hex[:12]
    assert re.fullmatch(r"p01_pay_after_[0-9a-f]{12}", template)
    b01.base.TARGET = template
    b01.TARGET = template
    with database_lock():
        b01.base.assert_local_target()
        created = False
        try:
            schema = b01.base.call(["exec", b01.base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"])
            b01.sql('create database "' + template + '";', db="postgres")
            created = True
            b01.sql(schema, user="supabase_admin")
            # Only cloned scratch application schemas; preserve managed auth/storage.
            reset = """
drop schema public cascade;
drop schema if exists payments_private cascade;
drop schema if exists payments_worker cascade;
drop schema if exists identity_private cascade;
drop schema if exists providers_private cascade;
drop schema if exists catalog_private cascade;
drop schema if exists booking_private cascade;
create schema public authorization postgres;
grant usage on schema public to anon,authenticated,service_role;
grant all on schema public to postgres,service_role;
do $$ declare p record; begin
 for p in select schemaname,tablename,policyname from pg_policies where schemaname='storage' and tablename in ('objects','buckets') loop
  execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 end loop;
end $$;
"""
            b01.sql(reset, user="supabase_admin")
            for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
                b01.sql(path.read_text(encoding="utf-8"))
                print("PASS: migration " + path.name, flush=True)
            for path in sorted((ROOT / "supabase/tests").glob("0[78][0-9]_p01_*.test.sql")):
                b01.sql(b01.base.suite_text(path.name))
                print("PASS: SQL suite " + path.name, flush=True)
            races(b01, template)
            worker_race(b01, template)
        finally:
            if created:
                b01.sql('drop database "' + template + '" with (force);', db="postgres")


if __name__ == "__main__":
    main()
