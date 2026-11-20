# P5 ambulance category block: handoff

- Task: P5 AMBULANCE category block (S01-A), per `C:\tmp\scv_logs\kiro_ambulance_v2.txt`.
- Agent: Kiro CLI. Branch `feat/P5-ambulance`, base `integ/all` at `51c7439`.
- Ground truth: `docs/specs/P5_shared_engine_contract.md` v1.0 (wins), then `docs/specs/P5_ambulance_flow_design.md`, then `docs/OWNER_DECISIONS_PENDING.md` defaults.
- Ownership used: migrations `20261117001800`, `001810`, `001820` (fixes `001830`-`001899` free), suites `050`-`056` (`057`-`059` free), fixture `_p5a_fixture.inc`, runner `run_p5a_concurrency.py`.

**DB NOT EXECUTED.** Every SQL file here (migrations, suites, fixture, runner) is authored and desk-checked against the shared definitions in `20261117001550`-`001590`, `_b01_fixture.inc` and `_p5s_fixture.inc`. None of it has run. No Docker or Supabase command was used.

## Commands the teammate must run

```text
npx supabase db reset --local
npx supabase test db
python tests/rls/run_p5a_concurrency.py
```

Static checks run on this branch (all clean): `node node_modules/vitest/vitest.mjs run` (19 files, 306 passed, 2 skipped, including the 3 new ambulance files with 67 tests), `node node_modules/next/dist/bin/next typegen` then `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`, and once at the end `NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build --webpack` (Turbopack cannot resolve `next` through the `node_modules` junction). The build lists all 21 ambulance routes as `ƒ (Dynamic)`.

## Migrations

All three start with a preflight that raises if a shared object they use is missing. No shared function, trigger, policy or constraint is replaced or dropped. Every new function is `security definer`, `search_path=''`, revoked from `public, anon, authenticated, service_role`; public RPCs are then granted to `authenticated` only. Every new table has RLS on and no API-role privilege. The `ambulance` gate is not touched (seeded `off` by `001550`); `FEATURE_SCHEDULED_TRANSPORT` defaults off.

### `20261117001800_amb_fleet.sql`
- Schema `ambulance_private` (no usage for API roles here).
- Tables: `ambulance_vehicles` (one row per vehicle resource; type, supports, case state), `vehicle_credential_documents` (four kinds, `vehicle/<resource>/<doc>.<ext>`), `vehicle_credential_events` (immutable, one row per vehicle version), `ambulance_drivers` (roster), `ambulance_private.vehicle_document_read_tickets` (60 s, immutable). Guard triggers on the first four.
- Predicates: `required_vehicle_kinds()`, `vehicle_evidence_ready`, `vehicle_eligible(provider, resource, requirement, until)`, `driver_eligible(provider, resource, until)` (roster, `resource_eligible` which now includes Q06, and a licence valid past `until`: a verified `licence` provider document for an individual owner, the approved Q06 licence case for staff), `fleet_manager`, `evidence_editor`, `vehicle_document_read_allowed`.
- RPCs (authenticated): `register_ambulance_vehicle`, `add_vehicle_document`, `submit_vehicle_case`, `authorize_vehicle_document_read`, `review_vehicle_case` (AMB-Q16 default: approval needs an `admin_review` ticket issued after submission for each pending document), `set_ambulance_driver`, `get_fleet`.

### `20261117001810_amb_fleet_storage.sql`
- `ambulance_private.vehicle_object_access(bucket, name, writing)`: upload by the uploading evidence editor of a pending document in a draft/rejected case, upload read-back only under `storage.object.upload`, download only with a live ticket whose rule still holds.
- Two additive permissive policies `amb_vehicle_objects_insert` / `amb_vehicle_objects_read`. Usage on `ambulance_private` and execute on this one predicate are granted to `authenticated` because policies run as the caller.
- It does **not** edit `i02_objects_guard` (see conflicts). Until a shared fix appends the predicate to that restrictive guard, vehicle objects fail closed for every API role.

### `20261117001820_amb_trips.sql`
- Reason codes (insert, `on conflict do nothing`): `picked_up` (blocks cancel), `destination_reached`, `eligibility_blocked`, `vehicle_breakdown`, `requirement_mismatch`, `driver_unable`, with their ambulance `category_reasons` rows.
- `ambulance_private.policy()`: lead 120 min, accept lead 60 min, horizon 30 days, buffers 30/30, max 360 min.
- `public.transport_trips` (destination snapshot with exactly `line1, locality, pin_code`, requirement, substate) and its guard: insert only for a `requested` ambulance booking; only substate/version change, along fixed edges and paired with the booking state read at trigger time. Ops never writes it (contract §6.1).
- `list_transport_slots(provider_reference, service, date, requirement)`: gate `on` or no rows; eligible, non-busy driver and vehicle; buffers.
- `request_transport(...)`: replay `transport.create` first, gate, patient lock, replay again, destination ownership, ambulance service under the duration cap, self-dealing, per-patient overlap, then `create_request_core(..., interval '120 min', interval '30 days')`, gate and destination coverage again under the provider lock, requirement availability, trip insert.
- `accept_transport(booking, version, driver, vehicle, request_key)`: keyed (`p5.ambulance.accept`), scheduler, gate before and after locks, accept lead, offer and both-end coverage, eligibility, driver is never the patient, `resource_busy`, schedule, two assignments and reservations (the shared guard and exclusion apply), `accepted` and `confirmed`.
- `advance_trip(booking, step, version, request_key, reason)` returns `{version, substate, blocked}`. Order per contract §13.1. Gate phase `start` for `en_route`, `arrived`, `picked_up`; `closeout` for the rest. `destination_reached` and on-board `interrupt` go through `assignee_finish` (closeout allowed); on-board interrupt also opens `interrupted_after_pickup` while the resource rows are locked; absence opens `absence_reported` and ends the assignment (`finish_assignments`); pre-pickup interrupt uses `transition` plus `finish_assignments`. A lapsed paper at `en_route` writes `eligibility_blocked`, opens `eligibility_lapsed` and returns normally.
- Reads: `get_trip` (patient, scheduler, driver via `is_assigned` or `closeout_assignee`; non-patients get PINs only, nobody gets actor ids, the patient sees the plate only during `en_route`/`arrived`/`picked_up`), `get_trip_destination` (gated by shared `contact_allowed`, audited with the same actions as `get_assignment_contact`), `list_trip_queue`, `list_driver_trips`.

## pgTAP suites (all `DB NOT EXECUTED`)

| Suite | Cases |
|---|---|
| `050_amb_fleet` | Fixture approves both vehicles through the public path; registration refusals (person, other org, non-ambulance provider, empty/unknown/duplicate supports, type outside `fleet_types`, staff); submission needs every kind, unexpired, with bytes; supersede; review denials (no tickets, owner/member, disabled member, reader without verify, AAL1, empty reason, stale, suspend without capability), reject; individual-owner exclusion; eligibility recomputed from documents; guards; driver eligibility (no case, `vehicle_permit` case, suspended, expired, other operator, roster disabled, individual owner with and without licence); roster disable with future vs only past reservations; suspension; `get_fleet` key sets; privileges and RLS on all five tables and functions; immutable ledger. |
| `051_amb_storage` | Predicate: editor upload, other bucket, unreserved name, non-editor, other operator; read-back only under the upload operation; no writes after submission; ticket reads, personal tickets, revoked capability, expired ticket, owner view; only two permissive policies added, shared guard unchanged; authenticated insert of a vehicle object still fails 42501 (fail closed until the shared fix). |
| `052_amb_request_accept` | Generic create/accept/slots refuse ambulance (gate on and off); gate off/suspended refuses request, accept and slots, writes nothing; trip row shape; lead 119 min, 31 days, duration cap, non-ambulance service; uncovered and expired destination, uncovered pickup, same address, other patient's addresses, other requester; `requirement_unavailable`; overlap; replay, changed-argument conflict, 10-request cap with replay after cap and gate off; self-dealing at create and patient-as-driver at accept; accept refusals (other operator driver/vehicle, two persons, two vehicles, same id, unverified driver, unapproved vehicle, missing requirement, other scheduler, patient, non-ambulance booking) with nothing reserved; accept inside 60 min; destination coverage revoked (`offer_changed`); two assignments and 30/30 reservations, events, outbox keys; keyed accept replay and conflicts; `resource_busy` from an on-board interruption and from an overrun, slots excluding them, ops resolution unblocking. |
| `053_amb_progress` | Full journey (states, events, outbox, kept reservations, trip versions); trip guard; out-of-order steps; authority (other driver, scheduler, patient, other operator); input and stale checks; `too_early`; replay, same-key other step, repeated step; cancel blocked after `en_route` and `arrived`; pre-pickup interruption from `arrived` and `assigned`; driver reason rules; on-board interruption and its resolution; gate suspended per step, gate off; eligibility block (result, event, exception, replay, second attempt, cancel allowed); provider suspended on board (closeout, no contact, `closed_while_ineligible`); past `end_at + 12 h`; absence (no cancel, scheduler cannot `no_show`, ops without capability and without AAL2 refused, ops `no_show`, ops `absence_disputed`); membership removed on board (closeout 42501, ops close). |
| `054_amb_privacy` | `get_trip` key sets for scheduler, driver, patient; no address, phone, patient id, provider id, amount or actor id for non-patients; generic `get_booking` key set for the scheduler; plate timing; contact and destination denied for the scheduler, the patient (destination), the driver before the window, after completion and after interruption, with no audit rows; one audit row per allowed read; ops contact only with an open exception (`booking.contact_viewed_ops`); queue refreshes write no audit; Realtime publishes nothing; function and table privileges. |
| `055_amb_gates_replay` | Per gate state: admission only when on; decline, cancel and reads always; one `feature_gate_events` row per change. Replay after `destination_reached`, pre-pickup and on-board interrupt, and absence: same key returns the original result with no event; changed version 40001; another actor is a new call (42501); replay after membership disabled, Q06 expired and gate suspended; absence replay after the ops close; ops close replay. |
| `056_amb_cross_category` | Overrunning lab work blocks `accept_transport` and slots; closing it frees the person; an overrunning trip blocks a lab accept and shows as overdue in `list_booking_exceptions`; an on-board interruption blocks a doctor accept until ops resolves it; a normal completion leaves nothing busy. |

## Concurrency (`tests/rls/run_p5a_concurrency.py`, NOT EXECUTED)

Imports `run_b01_concurrency.py`; clones the schema into a scratch DB (also dropping `payments_*` and `ambulance_private` before replay) and commits the three fixtures.
1. Two accepts with overlapping buffered reservations on one vehicle: one commits, the other `23P01`, nothing written by the loser.
2. `en_route` vs `cancel_booking` on one version: `en_route` wins, cancel `40001`.
3. Two `picked_up` with different keys: one event, loser `40001`.
4. One key raced twice on `destination_reached`: both answer, one event, one replay row.
5. Roster disable vs accept in both orders (`55000` / `40001 resource_in_use`).
6. Vehicle suspension vs accept in both orders (both succeed / `55000`).

## App layer

- `src/lib/ambulance/service.ts` (`ambulanceCommand`, fixed RPC names, error mapping: gate messages 503 `feature_unavailable`; named 55000/40001 messages 409 with that code; `23P01` 409 `resource_conflict`; 42501 403, P0002 404, 22023 422, 53300 429; deadlock retried twice, stale never).
- `src/lib/ambulance/http.ts` (`admissionOpen` with `connection()`, `tripStepRoute`), `src/lib/validation/ambulance.ts` (strict zod; no location, ETA, price or category keys).
- `src/lib/feature-flags/index.ts` and `.env.example`: `FEATURE_SCHEDULED_TRANSPORT`.
- Routes: `GET /api/bookings/transport/slots`, `POST /api/bookings/transport` (201), `GET /api/bookings/[id]/trip`, `POST /api/bookings/[id]/trip/destination`, `POST /api/bookings/[id]/trip/accept`, `POST /api/bookings/[id]/trip/{en-route,arrived,absence,picked-up,destination-reached,interrupt}`, `GET /api/provider/ambulance/{queue,fleet}`, `POST /api/provider/ambulance/vehicles`, `POST /api/provider/ambulance/vehicles/[id]/{documents,submit}`, `POST /api/provider/ambulance/drivers`, `GET /api/driver/trips`, `POST /api/ambulance/vehicle-documents/[id]/read-ticket`, `POST /api/admin/ambulance/vehicles/[id]/review`. Only slots, request and accept read the env flag. `Idempotency-Key` required on request, accept and every step. The pickup contact uses the shared `POST /api/bookings/[id]/contact`; ops uses the shared `/api/ops/*` routes (both on `integ/all` from `feat/P5-shared-api`, not re-created here).
- Tests: `tests/unit/ambulance-http.test.ts`, `ambulance-validation.test.ts`, `ambulance-isolation.test.ts`.

## Not built, and why

- Ops RPCs and `trip_exceptions` from the design (`ops_interrupt_trip`, `resolve_trip_absence`, `close_trip_exception`, `list_trip_exceptions`, `get_trip_contact`): replaced by the shared `ops_close_booking`, `ops_resolve_exception`, `list_booking_exceptions`, `booking_exceptions` and `get_assignment_contact` (contract §6.1, §8.4, §15). The `no_show` trip substate is dropped because ops never writes substates.
- The `i02_objects_guard` rebuild in `001810` (conflict 1 below). Consequence: no vehicle bytes can be uploaded through Storage until the shared fix lands, so no vehicle case can be submitted outside fixtures, and no trip can be accepted in a real environment.
- Design's "`not_started`/`overrun`" computed ops kinds: covered by the shared `booking_overdue` and `escalatable` in `list_booking_exceptions`.
- E-9 (`service_role` revokes on B01 tables): shared item, contract §2.5.
- Copy test for EN/HI/TE strings and the 112 notice (design §11.3) and the Playwright journey (§11.4): there is no ambulance UI in this ticket.
- "Patient cannot cancel after `start_at`" and stale `requested` requests (AMB-Q13): shared item §2.5, unchanged.
- A test that no signed URL can be created for a vehicle object: signing happens in the Storage API, not SQL; the built `i02_no_signing` policy is unchanged.
- Fleet commands are versioned (expected version), not keyed by `Idempotency-Key`, matching the built I02/Q06 evidence commands; contract §13 keying is applied to the booking-lifecycle commands (request, accept, advance). Flag for review if the coordinator reads §13.1 as covering fleet commands too.

## Contract / design conflicts found

1. **Storage guard (design §3.3 `001810` vs contract §1 rule 1).** The design rebuilds the shared restrictive policy `i02_objects_guard`; the contract forbids a category block from replacing objects outside its range, and parallel category rebuilds would drop each other's clauses. Resolved by authoring the predicate and permissive policies only. Needed shared fix (`001591`-`001599`): append `or ambulance_private.vehicle_object_access(bucket_id,name,false)` to `i02_objects_guard` USING and `...,true)` to its WITH CHECK.
2. **Env flag off answer.** Design §8 says 404 `feature_unavailable` and that steps/ops stay reachable; contract §10.1 says 503 on admission routes only. Built per the contract.
3. **`resource_busy` error class.** Design `40001`; contract §11.2 `55000`. Built `55000`.
4. **Driver trip list.** Design: own assignments active or ended in the last 7 days. Contract §8.3: assignee rows only while `is_assigned` or `closeout_assignee`. Built per the contract, so a driver does not see a trip until 60 minutes before start (the scheduler queue still shows it). Owner/coordinator may want a schedule view without contact.
5. **Ambulance cancel by the driver.** Design §9.3 lists cancel under "cannot" for the driver; contract §4.3 agrees (assignee cancel is doctor only). No conflict in the build; noted because the design's E-6 table also blocks cancel after `absence_reported`, which the shared seed does.
6. **Ops interrupt of an unstarted trip.** Design lets ops interrupt from `assigned` at any time; contract OD-8 default allows ops close only with an open exception, after `end_at + 12 h`, or with an in-progress trip nobody can close. Built per the contract (shared RPC).
7. **Trip contact route.** Design `GET /api/bookings/:id/trip/contact`; contract §8.4 requires POST and the shared `get_assignment_contact`. Built `POST /trip/destination` for the destination only.

## Security and privacy notes

- Non-patients never receive address lines, locality, phone, contact name, patient id, provider UUID, amounts or actor ids from ambulance RPCs; destination reads are audited per call with ids only.
- No location, distance or ETA is accepted or stored; no ambulance code reads `FEATURE_EMERGENCY_DISPATCH` or `FEATURE_GPS` (unit-tested).
- Vehicle review reasons are verifier text (1-500 chars) stored in `vehicle_credential_events`, as Q06 does; they concern papers, not patients.
- Until OD-2 names a `booking:incident` holder, absence and on-board interruptions stay open; the flow is a synthetic demonstration only.

## Next action

Teammate runs the three commands above and reports failures against this file; a shared author adds the storage-guard clause; coordinator reviews conflicts 1, 4 and the §13 keying question.
