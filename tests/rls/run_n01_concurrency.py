"""N01 suites and real races in a unique LOCAL, synthetic scratch database.

Authored, DB NOT EXECUTED. This laptop must not run --execute.
Teammate with an approved running local stack:
  python tests/rls/run_n01_concurrency.py --execute --shared-merged
No imports of Docker-dependent legacy helpers, DB operation or lock-file writes
occur without both flags. No source data or Docker lifecycle operation is used.
"""
import argparse
import importlib.util
import json
import os
import queue
import re
import shlex
import subprocess
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCK = Path("C:/tmp/scv_logs/db.lock")
PATIENT = "b1000000-0000-4000-8000-000000000001"
PROJECT_MANAGED_OBJECTS = {
    ("TRIGGER", "auth", "users", "i01_auth_profile"),
    ("POLICY", "storage", "buckets", "i02_buckets_locked"),
    ("POLICY", "storage", "buckets", "i01_buckets_locked"),
    *{("POLICY", "storage", "objects", name) for name in (
        "i02_objects_guard", "i02_objects_read", "i02_objects_insert",
        "i02_objects_no_update", "i02_objects_no_delete", "i02_no_signing",
        "q06_staff_upload", "q06_staff_upload_readback", "i01_objects_locked",
    )},
}


def managed_restore_list(toc):
    """Omit exact app-owned TOC objects; preserve native Auth/Storage objects.

    Project triggers/policies depend on private schemas that migrations recreate.
    A custom-format archive avoids editing SQL bodies or managed definitions.
    """
    lines = []
    for line in toc.splitlines():
        parts = line.split()
        # pg_restore list: dump-id; catalog-oid object-oid TYPE schema table name owner
        identity = tuple(parts[3:7]) if len(parts) >= 8 else None
        if identity not in PROJECT_MANAGED_OBJECTS:
            lines.append(line)
    return "\n".join(lines) + "\n"


@contextmanager
def database_lock():
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    marker = "codex-n01 " + str(time.time()) + " " + uuid.uuid4().hex
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            stat = LOCK.stat()
            if time.time() - stat.st_mtime < 1800:
                print("Shared DB lock busy; no database operation.", flush=True)
                time.sleep(10)
                continue
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


def load_b01():
    spec = importlib.util.spec_from_file_location("n01_b01", ROOT / "tests/rls/run_b01_concurrency.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def include(name):
    """Recursively inline only same-directory fixtures, never execute them here."""
    path = ROOT / "supabase/tests" / name
    if path.parent != ROOT / "supabase/tests" or not path.is_file():
        raise ValueError("Invalid fixture path")
    return re.sub(r"^\\ir\s+(\S+)\s*$", lambda match: include(match.group(1)),
                  path.read_text(encoding="utf-8"), flags=re.M)


def role(name):
    if name not in {"postgres", "authenticated", "service_role"}:
        raise ValueError("Invalid database role")
    sql = "set local role " + name + ";"
    if name == "authenticated":
        claims = json.dumps({"sub": PATIENT, "role": name, "aal": "aal2"})
        sql += "select set_config('request.jwt.claims','" + claims + "',true);"
    return sql


def start(b01, db, statement, actor="postgres", held=False):
    proc = subprocess.Popen([b01.base.DOCKER, *b01.args(db), "-v", "VERBOSITY=verbose"],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, bufsize=1)
    app = "n01_" + uuid.uuid4().hex[:12]
    proc.stdin.write("set application_name='" + app + "';set statement_timeout='45s';set idle_in_transaction_session_timeout='120s';begin;" + role(actor) + statement)
    if held:
        proc.stdin.write("select 'N01_READY';\n")
        proc.stdin.flush()
        incoming = queue.Queue()
        def read_barrier():
            for line in proc.stdout:
                incoming.put(line)
                if line.strip() == "N01_READY":
                    return
            incoming.put(None)
        threading.Thread(target=read_barrier, daemon=True).start()
        lines = []
        deadline = time.monotonic() + 60
        try:
            while True:
                line = incoming.get(timeout=max(0.01, deadline-time.monotonic()))
                if line is None:
                    raise RuntimeError("Worker failed before barrier: " + proc.stderr.read()[-1500:])
                if line.strip() == "N01_READY":
                    break
                lines.append(line)
            return proc, app, "".join(lines)
        except (queue.Empty, RuntimeError):
            stop(proc)
            raise RuntimeError("Worker startup/barrier failed within its timeout") from None
    proc.stdin.write("commit;\n")
    proc.stdin.close()
    return proc, app, ""


def finish(proc, held=False):
    if held:
        proc.stdin.write("commit;\n")
        proc.stdin.close()
    if proc.wait(timeout=60):
        raise RuntimeError("Worker failed: " + proc.stderr.read()[-1500:])
    return proc.stdout.read()


def stop(proc):
    if proc is not None and proc.poll() is None:
        proc.kill()
        proc.wait(timeout=10)


def assert_sql(b01, db, query, label):
    if b01.sql(query, db=db).strip() != "t":
        raise RuntimeError(label)


def races(b01, db):
    setup = include("_tap_helpers.inc") + include("_n01_fixture.inc") + """
select pg_temp.n01_no_quiet(); select pg_temp.n01_optin();
update notify_private.settings set lease_seconds=3600;
select pg_temp.n01_delivery() from generate_series(1,4);
select pg_temp.n01_event('doctor','confirmed','accepted','confirmed') from generate_series(1,2);
"""
    b01.sql("begin;" + setup + "commit;", db=db)
    first = second = None
    try:
        first, _, output = start(b01, db, "select c::text from notify_worker.claim('sms',1) c;", "service_role", True)
        second, app, _ = start(b01, db, "select c::text from notify_worker.claim('sms',1) c;", "service_role")
        deadline = time.monotonic() + 45
        while b01.sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='" + app + "' and wait_event_type='Lock';", db=db).strip() != "1":
            if second.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError("Claims did not establish overlapping transactions")
            time.sleep(0.05)
        finish(first, held=True)
        output2 = finish(second)
        # Results contain delivery ids only; never print claim objects/destinations.
        ids1 = set(re.findall(r'"delivery_id"\s*:\s*"([0-9a-f-]{36})"', output))
        ids2 = set(re.findall(r'"delivery_id"\s*:\s*"([0-9a-f-]{36})"', output2))
        if len(ids1) != 1 or len(ids2) != 1 or ids1 & ids2:
            raise RuntimeError("Concurrent claims were not disjoint")
        print("PASS: overlapping claims lease disjoint rows", flush=True)
    finally:
        stop(first)
        stop(second)
    try:
        first, _, _ = start(b01, db, "select notify_worker.expand(100);", held=True)
        output = b01.sql("select notify_worker.expand(100);", db=db).strip()
        if output != "0":
            raise RuntimeError("Second expander did not yield")
        finish(first, held=True)
        b01.sql("select notify_worker.expand(100);", db=db)
        assert_sql(b01, db, "select count(*)=count(distinct(event_id,recipient_profile_id,template_key)) from public.notifications;", "Duplicate inbox rows")
        assert_sql(b01, db, "select count(*)=count(distinct dedupe_key) from notify_private.deliveries;", "Duplicate deliveries")
        print("PASS: overlapping expansion creates no duplicates", flush=True)
    finally:
        stop(first)
    # A worker's late accepted result cannot complete the second worker's lease.
    output = b01.sql("begin;" + role("service_role") + "select c->>'delivery_id' from notify_worker.claim('sms',1) c;commit;", db=db)
    ids = re.findall(r"^[0-9a-f-]{36}$", output, flags=re.M)
    if len(ids) != 1:
        raise RuntimeError("Expected one expiry-test delivery")
    delivery = ids[0]
    b01.sql("update notify_private.deliveries set lease_until=clock_timestamp()-interval '1 second',version=version+1 where id='" + delivery + "';select notify_worker.sweep();", db=db)
    b01.sql("begin;" + role("service_role") + "select count(*) from notify_worker.claim('sms',1);commit;", db=db)
    assertion = """do $$ begin
 begin perform notify_worker.complete('%s',1,'accepted',null,'log:%s');
  raise exception 'Late completion succeeded';
 exception when serialization_failure then null; end;
end $$;""" % (delivery, delivery)
    b01.sql("begin;" + role("service_role") + assertion + "commit;", db=db)
    assert_sql(b01, db, "select attempts=2 and status='leased' from notify_private.deliveries where id='" + delivery + "';", "Reclaimed lease changed unexpectedly")
    print("PASS: reclaimed lease rejects the first worker's late completion", flush=True)
    # A command's intake is invisible to expansion until its transaction commits.
    statement = """select public.create_booking_request(
 'b2000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001',
 'b5000000-0000-4000-8000-000000000001',clock_timestamp()+interval '3 days',gen_random_uuid());"""
    try:
        first, _, output = start(b01, db, statement, "authenticated", True)
        bookings = re.findall(r"^[0-9a-f-]{36}$", output, flags=re.M)
        if len(bookings) != 1:
            raise RuntimeError("Expected one booking id")
        booking = bookings[0]
        assert_sql(b01, db, "select count(*)=0 from notify_private.events where booking_id='" + booking + "';", "Uncommitted intake was visible")
        b01.sql("select notify_worker.expand(100);", db=db)
        finish(first, held=True)
        assert_sql(b01, db, "select count(*)=1 from notify_private.events where source_kind='booking_event' and booking_id='" + booking + "';", "Committed intake missing")
        print("PASS: booking and intake become visible together at commit", flush=True)
    finally:
        stop(first)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--shared-merged", action="store_true")
    options = parser.parse_args()
    if not (options.execute and options.shared_merged):
        parser.error("No DB operation: --execute and --shared-merged are required on the teammate's approved local stack")
    b01 = load_b01()
    db = "n01_notifications_" + uuid.uuid4().hex[:12]
    assert re.fullmatch(r"n01_notifications_[0-9a-f]{12}", db)
    with database_lock():
        b01.base.assert_local_target()
        created = False
        archive = "/tmp/" + db + ".dump"
        restore_list = "/tmp/" + db + ".list"
        try:
            # Managed schema definitions only; no source records or app-schema data.
            b01.base.call(["exec", b01.base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only", "--format=custom", "--no-publications", "--no-subscriptions", "--schema=auth", "--schema=storage", "--schema=extensions", "--file=" + archive])
            toc = b01.base.call(["exec", b01.base.CONTAINER, "pg_restore", "--list", archive])
            b01.base.call(["exec", "-i", b01.base.CONTAINER, "sh", "-c", "cat > " + shlex.quote(restore_list)], managed_restore_list(toc))
            b01.sql('create database "' + db + '";', db="postgres")
            created = True
            b01.base.call(["exec", b01.base.CONTAINER, "pg_restore", "--exit-on-error", "-U", "supabase_admin", "-d", db, "--use-list=" + restore_list, archive])
            # Legacy M0670 unconditionally creates pg_cron in postgres. This
            # scratch replay omits ONLY its two scheduler statements. M15 and
            # every N01 migration are replayed byte-for-byte, with their guards.
            for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
                text = path.read_text(encoding="utf-8")
                if path.name == "20261117000670_i02h_cr_fixes.sql":
                    for legacy in ["create extension if not exists pg_cron with schema pg_catalog;", "select cron.schedule('i02h-expire-due-providers', '17 * * * *', 'select public.expire_due_providers()');"]:
                        if text.count(legacy) != 1:
                            raise RuntimeError("Historical cron statements changed; review scratch adaptation")
                        text = text.replace(legacy, "-- Omitted in disposable side database only.")
                b01.sql(text, db=db)
            for path in sorted((ROOT / "supabase/tests").glob("10[0-9]_n01_*.test.sql")):
                b01.sql(include(path.name), db=db)
                print("PASS: " + path.name, flush=True)
            races(b01, db)
        finally:
            if created:
                b01.sql('drop database "' + db + '" with (force);', db="postgres")
            # Only the two exact, validated task artifacts; no recursive removal.
            b01.base.call(["exec", b01.base.CONTAINER, "rm", "-f", "--", archive, restore_list])


if __name__ == "__main__":
    main()
