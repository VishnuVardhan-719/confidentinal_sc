"""Synthetic I01 SQL/concurrency tests in a disposable DB on local Supabase.
Uses existing Docker/PostgreSQL only. Never alters or resets the source database.
Run: python3 tests/rls/run_i01_followups.py [--red | --current-schema]
"""
import ipaddress
import os
import json
import re
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = "supabase_db_surecurevisit"
DOCKER = shutil.which("docker.exe") or shutil.which("docker")
if not DOCKER:
    raise SystemExit("Docker executable not found")
TARGET = "i01_followups_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"i01_followups_[0-9a-f]{12}", TARGET)


def call(args, text=None, timeout=60):
    proc = subprocess.run([DOCKER, *args], input=text, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, timeout=timeout)
    if proc.returncode:
        raise RuntimeError("Docker/PostgreSQL failed: " + proc.stderr[-2500:])
    return proc.stdout


def psql_args(db=TARGET, user="postgres"):
    return ["exec", "-i", CONTAINER, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", db]


def sql(statement, db=TARGET, user="postgres"):
    return call(psql_args(db,user), statement)


def assert_local_target():
    allowed = {"default", "desktop-linux"}
    def local_endpoint(value):
        return value.startswith(("unix://", "npipe://"))
    host = os.environ.get("DOCKER_HOST", "")
    if host and not local_endpoint(host):
        raise RuntimeError("Refusing non-local DOCKER_HOST")
    context_env = os.environ.get("DOCKER_CONTEXT", "")
    if context_env and context_env not in allowed:
        raise RuntimeError("Refusing non-local DOCKER_CONTEXT")
    context = call(["context", "show"]).strip()
    if context not in allowed:
        raise RuntimeError("Refusing non-local Docker context")
    endpoint = call(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]).strip()
    if not local_endpoint(endpoint):
        raise RuntimeError("Refusing remote endpoint on Docker context")
    address = sql("select coalesce(inet_server_addr()::text,'unix-socket');", db="postgres").strip()
    if address != "unix-socket" and not ipaddress.ip_address(address).is_loopback:
        raise RuntimeError("Refusing non-local PostgreSQL address")
    print("PASS: local Docker context, endpoint and PostgreSQL target verified", flush=True)


def claims(actor):
    return "select set_config('request.jwt.claims','" + json.dumps({"sub": actor, "role": "authenticated"}) + "',true);"


def reciprocal():
    a = "73000000-0000-4000-8000-000000000001"
    b = "73000000-0000-4000-8000-000000000002"
    oa = "74000000-0000-4000-8000-000000000001"
    ob = "74000000-0000-4000-8000-000000000002"
    sql("insert into auth.users(id,email,raw_user_meta_data) values "
        + "('"+a+"','reciprocal-a@example.invalid','{}'),('"+b+"','reciprocal-b@example.invalid','{}');"
        + "insert into public.organizations(id,name) values ('"+oa+"','Synthetic Reciprocal A'),('"+ob+"','Synthetic Reciprocal B');"
        + "insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,accepted_at) values "
        + "('"+oa+"','"+a+"','owner','active',array['org:read','members:read'],now()),"
        + "('"+ob+"','"+b+"','owner','active',array['org:read','members:read'],now());")
    app = "i01_reciprocal_" + uuid.uuid4().hex[:8]
    first = "set application_name='"+app+"'; begin; set local role authenticated;" + claims(a)
    first += "select public.set_organization_member('"+oa+"','"+b+"','staff','invited',array['org:read'],0);"
    first += "select pg_sleep(8); commit;"
    proc = subprocess.Popen([DOCKER, *psql_args()], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True)
    try:
        proc.stdin.write(first)
        proc.stdin.close()
        deadline = time.monotonic()+12
        while True:
            ready = sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='"+app+"' and wait_event='PgSleep';").strip()
            if ready == "1":
                break
            if proc.poll() is not None:
                raise RuntimeError("Connection A failed before barrier: " + proc.stderr.read()[-1500:])
            if time.monotonic() > deadline:
                raise RuntimeError("Connection A did not reach reciprocal invitation barrier")
            time.sleep(0.1)
        second = "begin; set local role authenticated;" + claims(b)
        second += "select public.set_organization_member('"+ob+"','"+a+"','staff','invited',array['org:read'],0); commit;"
        # B must finish while A still holds its transaction and FK locks.
        call(psql_args(), second, timeout=4)
        if proc.poll() is not None:
            raise RuntimeError("Connection A committed before reciprocal test could establish overlap")
        code = proc.wait(timeout=12)
        if code:
            raise RuntimeError("Connection A failed: " + proc.stderr.read()[-1500:])
        count = sql("select count(*) from public.organization_members where membership_role='staff' and status='invited' and accepted_at is null and invite_expires_at>clock_timestamp() and organization_id in ('"+oa+"','"+ob+"');").strip()
        if count != "2":
            raise RuntimeError("Reciprocal invitations did not both commit safely")
        print("PASS: reciprocal invitations commit on two overlapping connections, no deadlock", flush=True)
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()


def final_slot_race():
    def profile(n):
        return "75000000-0000-4000-8000-" + str(n).zfill(12)
    org = "76000000-0000-4000-8000-000000000001"
    sql("insert into auth.users(id,email,raw_user_meta_data) values " + ",".join(
        "('"+profile(n)+"','cap-race-"+str(n)+"@example.invalid','{}')" for n in range(1,29)) + ";"
        + "insert into public.organizations(id,name) values ('"+org+"','Synthetic Final Slot');"
        + "insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,accepted_at) values "
        + ",".join("('"+org+"','"+profile(n)+"','owner','active',array['org:read','members:read'],now())" for n in (1,2)) + ";"
        + "insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,invite_expires_at) values "
        + ",".join("('"+org+"','"+profile(n)+"','staff','invited',array['org:read'],clock_timestamp()+interval '14 days')" for n in range(5,29)) + ";")
    apps = ["i01_cap_"+uuid.uuid4().hex[:8] for _ in range(2)]
    processes = []
    def start(index):
        statement = "set application_name='"+apps[index]+"'; begin; set local role authenticated;" + claims(profile(index+1))
        statement += "select public.set_organization_member('"+org+"','"+profile(index+3)+"','staff','invited',array['org:read'],0);"
        statement += ("select pg_sleep(8);" if index == 0 else "") + "commit;"
        proc = subprocess.Popen([DOCKER, *psql_args(), "-v", "VERBOSITY=verbose"], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        processes.append(proc)
        proc.stdin.write(statement)
        proc.stdin.close()
        return proc
    def barrier(proc, app, condition):
        deadline = time.monotonic()+12
        while sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='"+app+"' and "+condition+";").strip() != "1":
            if proc.poll() is not None:
                raise RuntimeError("Cap race connection exited before barrier: " + proc.stderr.read()[-1500:])
            if time.monotonic()>deadline:
                raise RuntimeError("Cap race did not establish overlapping transactions")
            time.sleep(0.1)
    try:
        a = start(0)
        barrier(a,apps[0],"wait_event='PgSleep'")
        b = start(1)
        barrier(b,apps[1],"wait_event_type='Lock'")
        if a.poll() is not None:
            raise RuntimeError("First cap transaction ended before second blocked")
        codes = [proc.wait(timeout=15) for proc in processes]
        errors = [proc.stderr.read() for proc in processes]
        if codes[0] != 0 or codes[1] == 0 or "23514" not in errors[1] or "invitation_limit" not in errors[1]:
            raise RuntimeError("Expected exactly one cap-race success and one 23514 invitation_limit: " + str(codes) + str(errors)[-1500:])
        count = sql("select count(*) from public.organization_members where organization_id='"+org+"' and status='invited' and invite_expires_at>clock_timestamp();").strip()
        winners = sql("select count(*) from public.organization_members where organization_id='"+org+"' and profile_id in ('"+profile(3)+"','"+profile(4)+"');").strip()
        if count != "25" or winners != "1":
            raise RuntimeError("Final-slot race exceeded capacity or committed wrong target count")
        print("PASS: two owners race for final invite slot; one success, one 23514; exactly 25 pending", flush=True)
    finally:
        for proc in processes:
            if proc.poll() is None:
                proc.kill()
                proc.wait()


def main():
    assert_local_target()
    created = False
    try:
        running = call(["inspect", "--format", "{{.State.Running}}", CONTAINER]).strip()
        if running != "true":
            raise RuntimeError("Named local Supabase DB container is not running")
        # Schema only: no existing Auth, patient, provider, Storage or other data copied.
        schema = call(["exec", CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"], timeout=60)
        sql('create database "'+TARGET+'";', db="postgres")
        created = True
        # Restore privileged managed schemas with original owners; tests/migration
        # still run as postgres, matching the actual Supabase migration role.
        sql(schema,user="supabase_admin")
        current = "--current-schema" in sys.argv
        if current:
            print("PASS: isolated clone of current Supabase application schema", flush=True)
        else:
            # The running source may already include another task's I02 changes.
            # Rebuild only the scratch application schema from this branch's 001;
            # retain cloned Supabase Auth/Storage infrastructure and their real owners.
            reset = "drop schema public cascade; drop schema if exists identity_private cascade; create schema public authorization postgres; grant usage on schema public to anon,authenticated,service_role; grant all on schema public to postgres,service_role;"
            reset += "do @D@ declare p record; begin for p in select schemaname,tablename,policyname from pg_policies where schemaname='storage' and tablename in ('objects','buckets') loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop; end @D@;"
            sql(reset.replace("@D@",chr(36)*2),user="supabase_admin")
            sql((ROOT/"supabase/migrations/202611170001_i01_identity.sql").read_text())
            print("PASS: isolated Supabase infrastructure plus this branch's migration 001", flush=True)
            sql((ROOT/"tests/rls/i01_identity.sql").read_text())
            print("PASS: existing I01 SQL authorization suite before migration 003", flush=True)
        suite = (ROOT/"tests/rls/i01_followups.sql").read_text()
        if "--red" in sys.argv:
            try:
                sql(suite)
            except RuntimeError as error:
                if "does not exist" not in str(error):
                    raise
                print("EXPECTED FAIL before migration 003: new pagination/expiry schema is absent", flush=True)
                return
            raise RuntimeError("Follow-up suite unexpectedly passed before migration 003")
        sql((ROOT/"supabase/migrations/202611170003_i01_followups.sql").read_text())
        print("PASS: migration 003 applied on isolated database", flush=True)
        if not current:
            sql((ROOT/"tests/rls/i01_identity.sql").read_text())
            print("PASS: existing I01 SQL authorization suite after migration 003", flush=True)
        sql(suite)
        print("PASS: follow-up pagination/expiry/cap/ACL SQL suite", flush=True)
        reciprocal()
        final_slot_race()
    finally:
        if created:
            # Only the unique, validated, scratch DB created by this run is removed.
            sql('drop database "'+TARGET+'" with (force);', db="postgres")
            print("PASS: disposable test database removed; source DB unchanged", flush=True)


if __name__ == "__main__":
    main()
