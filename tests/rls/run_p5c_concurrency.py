"""P5 care-block races in a unique LOCAL scratch DB (design §10.2 C1-C5, contract §13.3).
Reuses the shared runner (tests/rls/run_p5s_concurrency.py, which imports the built
run_b01_concurrency.py helpers): clone the local schema, replay every migration, commit the
synthetic _b01/_p5s/_p5c fixtures, then run real overlapping transactions with deterministic
lock barriers. No source data, application-schema writes, resets or migrations in the source DB.
Run (after the shared block is merged): python tests/rls/run_p5c_concurrency.py
"""
import importlib.util
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("p5s_runner", ROOT / "tests/rls/run_p5s_concurrency.py")
p5s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p5s)
TARGET = "p5c_care_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"p5c_care_[0-9a-f]{12}", TARGET)
p5s.TARGET = p5s.b01.TARGET = p5s.base.TARGET = TARGET
sql, scalar, race, as_api = p5s.sql, p5s.scalar, p5s.race, p5s.as_api

PATIENT = "b1000000-0000-4000-8000-000000000001"
M = "c1000000-0000-4000-8000-000000000001"
W1 = "c1000000-0000-4000-8000-000000000002"
W2 = "c1000000-0000-4000-8000-000000000003"
V = "c1000000-0000-4000-8000-000000000004"
MB = "c1000000-0000-4000-8000-000000000007"
CM = "e1000000-0000-4000-8000-000000000001"
P2 = "e1000000-0000-4000-8000-000000000004"
R_W1, R_W2, R_P2 = "c6000000-0000-4000-8000-000000000001", "c6000000-0000-4000-8000-000000000002", "e6000000-0000-4000-8000-000000000004"
CARE_A, CARE_B = "c4100000-0000-4000-8000-000000000004", "e4100000-0000-4000-8000-000000000001"

# Bookings are accepted on future days, then moved with the shared shift helper (booking,
# assignment and reservation together) so no caregiver holds two overlapping active periods:
# W1 A [+10,+40) and G [-25,+5); W2 A2 [+10,+40) and B [-25,+5); P2 F [+10,+40) minutes.
SETUP = f"""
create temp table p5c_ids(name text primary key, value text not null);
create function pg_temp.id(n text) returns uuid language sql as $$ select value::uuid from p5c_ids where name=n $$;
insert into p5c_ids values
 ('A',pg_temp.c_book(pg_temp.p5_at(2),'{R_W1}')::text),
 ('A2',pg_temp.c_book(pg_temp.p5_at(2,1),'{R_W2}')::text),
 ('B',pg_temp.c_book(pg_temp.p5_at(3),'{R_W2}')::text),
 ('F',pg_temp.c_book(pg_temp.p5_at(4),'{R_P2}')::text),
 ('G',pg_temp.c_book(pg_temp.p5_at(5),'{R_W1}')::text),
 ('D1',pg_temp.c_request('{CARE_A}',pg_temp.p5_at(6))::text),
 ('D2',pg_temp.c_request('{CARE_B}',pg_temp.p5_at(6))::text),
 ('E',pg_temp.c_request('{CARE_A}',pg_temp.p5_at(7))::text),
 ('E2',pg_temp.c_request('{CARE_B}',pg_temp.p5_at(8))::text);
select pg_temp.p5_shift(pg_temp.id('A'),now()+interval '10 minutes');
select pg_temp.p5_shift(pg_temp.id('A2'),now()+interval '10 minutes');
select pg_temp.p5_shift(pg_temp.id('F'),now()+interval '10 minutes');
select pg_temp.p5_shift(pg_temp.id('B'),now()-interval '25 minutes');
select pg_temp.c_start(pg_temp.id('B'),'{W2}');
select pg_temp.p5_shift(pg_temp.id('G'),now()-interval '25 minutes');
select pg_temp.c_start(pg_temp.id('G'),'{W1}');
insert into p5c_ids select 'P2CASE',id::text from public.provider_verification_cases
 where provider_id='c3000000-0000-4000-8000-000000000004' and subject_profile_id='{P2}';
select set_config('request.jwt.claims','',true);
select 'ID '||name||'='||value from p5c_ids;
"""
ID = re.compile(r"^ID (A2|A|B|F|G|D1|D2|E2|E|P2CASE)=([0-9a-f-]{36})$", re.M)


def fixtures():
    tests = ROOT / "supabase/tests"
    return "".join((tests / name).read_text(encoding="utf-8") for name in ("_b01_fixture.inc", "_p5s_fixture.inc", "_p5c_fixture.inc"))


def state(booking):
    return scalar(f"select state||':'||version from public.bookings where id='{booking}';")


def concurrency():
    out = sql("begin;" + fixtures() + SETUP + "commit;")
    ids = dict(ID.findall(out))
    if len(ids) != 10:
        raise RuntimeError("Setup did not return every id: " + str(sorted(ids)))
    print("PASS: synthetic care fixtures committed through the public paths", flush=True)
    k = lambda: uuid.uuid4()
    start = "select public.advance_care('{b}','started',{v},'{key}');"
    cancel = "select public.cancel_booking('{b}',{v},'patient_request');"

    # C1: caregiver start vs patient cancel on one version, both orders.
    race(as_api(PATIENT) + cancel.format(b=ids["A"], v=4), as_api(W1) + start.format(b=ids["A"], v=4, key=k()), "42501")
    if state(ids["A"]) != "cancelled:5" or scalar(f"select substate from public.care_plans where booking_id='{ids['A']}';") != "assigned":
        raise RuntimeError("Cancel-first did not leave exactly the cancellation")
    race(as_api(W2) + start.format(b=ids["A2"], v=4, key=k()), as_api(PATIENT) + cancel.format(b=ids["A2"], v=4), "40001")
    if state(ids["A2"]) != "in_progress:5" or scalar(f"select substate from public.care_plans where booking_id='{ids['A2']}';") != "started":
        raise RuntimeError("Start-first did not leave exactly the start")
    print("PASS: C1 start vs patient cancel in both orders: exactly one commits", flush=True)

    # C2: end vs interrupt on one version.
    race(as_api(W2) + f"select public.advance_care('{ids['B']}','ended',5,'{k()}');",
         as_api(W2) + f"select public.interrupt_care('{ids['B']}','other',5,'{k()}');", "42501")
    if scalar(f"select b.state||':'||p.end_outcome||':'||(select count(*) from public.booking_events e where e.booking_id=b.id and e.to_state in ('completed','interrupted'))"
              f" from public.bookings b join public.care_plans p on p.booking_id=b.id where b.id='{ids['B']}';") != "completed:completed:1":
        raise RuntimeError("End vs interrupt did not commit exactly one terminal step")
    print("PASS: C2 end vs interrupt: exactly one terminal step", flush=True)

    # C3: one caregiver accepted by two providers for overlapping periods.
    accept = "select public.accept_booking('{b}',2,array['{r}'::uuid]);"
    race(as_api(M) + accept.format(b=ids["D1"], r=R_W1), as_api(MB) + accept.format(b=ids["D2"], r=R_W1), "23P01")
    if state(ids["D1"]) != "confirmed:4" or state(ids["D2"]) != "requested:2":
        raise RuntimeError("Overlapping accepts did not leave exactly one confirmed booking")
    print("PASS: C3 overlapping accepts across providers: one commits, one 23P01", flush=True)

    # C4: task-list change vs accept, both orders. Accept never commits a stale snapshot.
    tasks = "select public.set_care_service_tasks('{s}',array['escort_walk'],1,'{key}');"
    race(as_api(CM) + tasks.format(s=CARE_A, key=k()), as_api(M) + accept.format(b=ids["E"], r=R_W1), "40001")
    if state(ids["E"]) != "requested:2" or scalar(f"select version from public.care_service_tasks where service_id='{CARE_A}';") != "2":
        raise RuntimeError("Accept committed after the task list changed")
    race(as_api(MB) + accept.format(b=ids["E2"], r=R_W1), as_api(MB) + tasks.format(s=CARE_B, key=k()), None)
    if state(ids["E2"]) != "confirmed:4" or scalar(f"select substate||':'||service_tasks_version from public.care_plans where booking_id='{ids['E2']}';") != "assigned:1" \
            or scalar(f"select version from public.care_service_tasks where service_id='{CARE_B}';") != "2":
        raise RuntimeError("Accept-first order did not keep the snapshot it accepted")
    print("PASS: C4 task change vs accept in both orders: no accept on a changed offer", flush=True)

    # C5: Q06 suspension vs caregiver start; suspension first wins.
    review = f"select public.review_staff_credential_case('{ids['P2CASE']}','suspended','Synthetic suspension',4);"
    race(as_api(V) + review, as_api(P2) + start.format(b=ids["F"], v=4, key=k()), "42501")
    if state(ids["F"]) != "confirmed:4":
        raise RuntimeError("Start committed after the caregiver's case was suspended")
    print("PASS: C5 case suspension vs start: the start is refused", flush=True)

    # §13.3: one end key delivered twice concurrently.
    key = k()
    same = as_api(W1) + f"select public.advance_care('{ids['G']}','ended',5,'{key}');"
    race(same, same, None)
    if scalar(f"select count(*) from public.booking_events where booking_id='{ids['G']}' and reason='service_completed';") != "1" \
            or scalar(f"select count(*) from public.idempotency_requests where action='p5.care.advance' and request_key='{key}';") != "1":
        raise RuntimeError("One key raced twice wrote more than one event or replay row")
    print("PASS: duplicate end key: both return, one event, one replay row", flush=True)


def build():
    """The shared p5s.build() reading migrations as UTF-8 (they contain section signs)."""
    base = p5s.base
    schema = base.call(["exec", base.CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"], timeout=180)
    sql('create database "' + TARGET + '";', db="postgres")
    sql(p5s.without_cron(schema), user="supabase_admin")
    # Every block's <name>_private/<name>_worker schema (care_private included).
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
    assert re.fullmatch(r"p5c_care_[0-9a-f]{12}", TARGET)
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
