# S01 doctor core, Phase B handoff

Task: S01 doctor core, Phase B. Agent: Kiro. Branch: `feat/S01-doctor-core`.
Authority: `C:/tmp/scv_logs/kiro_doctor3.txt`; review input `C:/tmp/scv_logs/review_doctor_phaseA.md`.
Base: Phase A/A2 at `05961da`, merged with `origin/integ/all` at `51c7439` (P5 shared engine
`20261117001550`-`001590` and P01a `20261117002000`), then at `ea22773` (P5 shared API routes).
The commit identity is the branch HEAD.

**DB NOT EXECUTED.** Every migration, pgTAP suite and concurrency case below is authored and
desk-checked only. This laptop runs no Docker; no `docker` or `supabase` command was run and
`C:/tmp/scv_logs/db.lock` was not touched. No dependency install, `.env` access or push to
`main`, `develop` or `integ/all`.

## Phase B changes

1. Merges of `origin/integ/all`. The only conflict both times was `src/lib/booking/service.ts`.
   The integ/all version was taken and only the doctor RPC names were re-appended to the
   `Command` union, because the doctor routes need them to type-check. Gate mapping and status
   table are the shared ones. No shared migration, `_p5s_fixture.inc`, suite 020-027, P01a SQL
   or `src/lib/booking/*` behaviour was changed. The shared `/api/ops/*` and
   `POST /api/bookings/[id]/contact` routes are not duplicated; the doctor block reads contact
   only through the shared `get_assignment_contact`.
2. Review H4: every `advance_visit` caller now uses `advance_visit(uuid,text,integer,uuid)`.
   The unkeyed RPC stays dropped (contract A13.2).
   - `005_b01_booking`, `012_b01_legacy` (identical bodies): keyed denials; happy path
     `en_route` 4->5, `arrived` 5->6, `service_started` at 6 refused with 55000, patient
     `issue_arrival_code`, doctor `verify_arrival_code` 6->7, `service_started` 7->8,
     `service_completed` 8->9, reopen at 9 refused with 42501. Assertions changed from
     "completion releases reservations" to: the assignment is `ended` with `ended_at`, its
     reservation is still `active`, substate `service_completed`, 8 booking events, 8
     transition audits plus one `booking.arrival_code_issued`, outbox payloads hold only
     `booking_id`, `event`, `version`.
   - `010_q06_staff`, `011_b01_fixes`, `018_q01_gaps`: keyed denial calls (same 42501) and the
     keyed T06 control step (=5).
   - `023_p5s_gates`: keyed start step with the doctor gate off, now asserted `=5`.
   - `_p01_fixture.inc` (`pg_temp.p01_book`) and `078_p01_disputes`: keyed steps; the patient
     issues and the person verifies the code before `service_started`.
   - Raw fixture paths in these files only move `start_at`/`end_at`. The
     `p5d_doctor_booking_guard` trigger has `WHEN (new.state is distinct from old.state)`, so
     those updates do not reach it. None of the authorised files moves a doctor booking into
     `in_progress` through a raw path. The shared suites that do are listed under conflicts.
   - `src/`: the four milestone routes already passed `p_request_key`; no change.
3. Re-check against the merged shared definitions (see table below). One change resulted:
   `20261117001630` now declares `create extension if not exists pgcrypto with schema extensions`
   (no-op on Supabase) because it calls `extensions.hmac` and `extensions.gen_random_bytes`.
4. `tests/rls/run_p5d_concurrency.py` builds its own scratch DB. `p5s.build()` resets only
   public/identity/providers/catalog/booking schemas. After a local reset the cloned schema
   already holds `doctor_private` and the P01a `payments_private`/`payments_worker`, and the
   replay of `001610`/`002000` would fail on `create schema`. The doctor runner drops those
   three schemas as well. It still uses the shared `sql`, `race`, `scalar`, `as_api`,
   `without_cron` and `base` helpers.

## Shared-definition check (merged `001550`-`001590`)

| Doctor call | Merged shared definition | Result |
|---|---|---|
| `require_gate('doctor','start')` | `require_gate(text,text) returns void`; 55000 `feature_suspended`/`feature_unavailable` | Match; closeout steps skip it |
| `request_hash(jsonb_build_array(...))` | `request_hash(jsonb) returns text` | Match |
| `replay(actor,action,key,hash)` reading `result_id`/`result_version` | OUT `result_id uuid`, `result_version integer`; 40001 `idempotency_conflict` | Match |
| `record_request(actor,action,key,hash,id,version)` | `(uuid,text,uuid,text,uuid,integer)`; `idempotency_requests.result_id` NOT NULL, `result_version` nullable | Match; every doctor call passes a non-null id (event, challenge, failure or fallback id) |
| `assignee_finish(b,'completed'/'interrupted',reason,key)` | `(uuid,text,text,uuid) returns integer`; opens `closed_while_ineligible` when not assigned | Match |
| `finish_assignments(b)` | doctor `category_paths.assignee_close='end_assignments'` | Match; reservations kept |
| `open_exception(b,kind,reason)` | `(uuid,text,text) returns uuid`; 55000 `exception_open` | Match; kinds `absence_reported`, `interrupted` exist |
| `transition(b,state,reason,key)` | built `(uuid,text,text,uuid default null) returns integer` | Match |
| `closeout_assignee(uuid)`, `is_assigned(uuid,text)`, `ops_actor(uuid)`, `gate_state(text)`, `lock_provider(uuid)`, `patient(uuid,text)`, `person_is_verified(uuid,uuid)`, `active_account()` | as merged | Match |
| Transition rows used | doctor `confirmed->in_progress`, `confirmed->interrupted`, `in_progress->completed/interrupted` (assigned, closeout) | Present; preflight checks one |
| Event reasons | doctor pairs for the shared codes plus the six doctor inserts | Present |
| Lock order | booking, provider, resources by id, `doctor_visits`/challenges/fallbacks, capability `for share` | Matches A11.4 and the merged `ops_resolve_exception` order |

Merged changes after the Phase A review (`ops_resolve_exception` lock order, `contact_allowed`
for ops with an open exception, an accept gate recheck) change no doctor call. P01a's
`p01_booking_state` trigger returns early for the same-state `confirmed` milestones.

## Migrations authored (doctor block)

- `20261117001610_p5d_visit_model.sql`: shared-block preflight; `doctor_private` schema;
  substates `arrival_verified`, `absence_reported`, `interrupted`; doctor reason codes and pairs
  (`address_not_found`, `declined_at_door`, `doctor_unable`, `patient_requested_stop`,
  `arrival_verified`, `arrival_assisted`); `guard_visit` (edges, booking state, matching event);
  `p5d_doctor_booking_guard` (a doctor booking enters `in_progress` only from `arrival_verified`);
  service_role writes revoked on `doctor_visits`.
- `20261117001620_p5d_assigned_doctor.sql`: `doctor_private.assignee`/`closeout` wrappers over the
  shared predicates bound to the visit's own assignment; self-dealing accept guard (42501
  `self_assignment`).
- `20261117001630_p5d_arrival_code.sql`: DC02. HMAC-SHA256 verifier, salt per challenge,
  derived (not stored) code, 5 min validity, 5 wrong attempts, 4 codes per visit, 60 s
  cooldown, constant-time compare. Keyed `issue_arrival_code(uuid,uuid)` and
  `verify_arrival_code(uuid,text,integer,uuid)`, which records failures (review H3/M1).
  Support-assisted fallback `open_arrival_fallback`/`confirm_arrival_fallback` behind gate
  `doctor_arrival_fallback`, seeded off.
- `20261117001640_p5d_visit_commands.sql`: keyed `advance_visit`, `report_patient_absent`,
  `interrupt_doctor_visit`; reads `list_my_doctor_visits` (approved deviation from A8.3) and
  `get_doctor_visit`.

## Suites authored (doctor block)

- `030_p5d_doctor_core` (150 assertions): catalog/grants; DC01 wrong actors on every command;
  gate phases; full path with arrival verification and keyed replay (same key replays, changed
  args 40001, per-actor keys, replay after gate suspension); code expiry, exhaustion,
  regeneration cap and cooldown, emergency interruption without a code; absence; pre-start and
  in-visit interruption; closeout after provider suspension; guards below the commands and for
  API roles; `in_progress` refused without a verified arrival.
- `031_p5d_staff_and_reads` (50): staff doctors D06/D07, D08 expired Q06 before start with
  `credential_ok=false`, D32 list key set/paging/input, D33/D34 `get_doctor_visit` patient-only
  P0002, D01/D02 early completion with kept reservation blocking an overlapping accept, D09 Q06
  lapse during the visit, A13.3 replay after offboarding/credential expiry/gate suspension, D19
  lab booking, D30 self-dealing, D31 overdue visit busy, D11 contact P0002 after absence.
- `032_p5d_arrival_fallback` (50): gate off by default and doctor suspension; ops-only opening at
  AAL2; replay and code revocation; patient-only confirm; expiry and per-visit cap; lockout
  path; terminal step closes a pending fallback; table guards and API-role privileges.
- Edited callers: `005`, `010`, `011`, `012`, `018`, `023`, `078`, `_p01_fixture.inc` (above).

## Concurrency cases (`tests/rls/run_p5d_concurrency.py`)

- C1: scheduler cancel vs `en_route`: cancel wins, `en_route` gets 42501.
- C2: closeout completion vs ops close, in both orders: exactly one terminal event.
- C5: one absence key delivered twice at once: one event, one exception, one replay row.
- M1: one wrong-code verification key delivered twice at once: one attempt, one failure row.
- H3: one issuance key delivered twice at once: one challenge.
- C3 (two ops resolving one exception) is in `run_p5s_concurrency.py`; C4 (overlapping accept)
  is the built exclusion constraint plus the B01 runner and suite 031 D02.

## Static verification (this branch, real output)

- `node node_modules/next/dist/bin/next typegen`: types generated.
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0.
- `node node_modules/eslint/bin/eslint.js .`: exit 0.
- `node node_modules/vitest/vitest.mjs run`: 18 files passed, 2 skipped; 304 tests passed,
  2 skipped (after the second merge).
- `NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build --webpack`: exit 0, run
  once at `428f343` (before the `ea22773` merge, to respect the RAM limit). All doctor routes
  (`absence`, `arrival-code`, `arrival-fallback`, `arrival-fallback/confirm`, `arrive`,
  `complete`, `en-route`, `interrupt`, `start`, `verify-arrival`, `visit`, `/api/doctor/visits`)
  are listed as dynamic. The default Turbopack build fails before compiling: it cannot resolve
  `next` through the `node_modules` junction. The `ea22773` merge adds only shared routes and
  validation, which pass tsc, ESLint and Vitest above.
- `python -m py_compile tests/rls/run_p5d_concurrency.py`: ok.

## Commands the teammate must run (local Docker machine)

```
npx supabase db reset --local
npx supabase test db
python tests/rls/run_p5d_concurrency.py
```

Expect the shared-suite failures listed below until their owner applies the fixes. Record the
real output in `docs/TEST_EVIDENCE.md`.

## Conflicts found (not fixed: outside the authorised files)

1. **Shared suites drive doctor bookings into `in_progress` without a verified arrival.** With
   `20261117001610` applied, `p5d_doctor_booking_guard` raises 55000 `arrival_not_verified` in
   the doctor iterations of `021` (`d3`, `p5_step` to `in_progress`), `022` (closeout loop,
   `p5_raw('doctor','in_progress')`), `024` (projection loop, `p5_step`), `026` (replay loop,
   `p5_raw`) and `027` (release loop, `p5_step`, twice). `p5_raw` disables only
   `b01_booking_guard`. Suggested owner fix: in `_p5s_fixture.inc` `p5_raw`, also disable
   `p5d_doctor_booking_guard` when it exists. For the `p5_step` paths, drive doctor bookings
   through `advance_visit` with issue/verify, or set the visit to `arrival_verified` as a
   labelled owner fixture. The guard stays: it is the DB enforcement of DC02.
2. **`025_p5s_reasons` asserts shared-only registry totals**: 19 codes, `doctor:18` pairs and a
   fixed `blocks_cancel` list. The doctor block adds 6 codes, 6 doctor pairs and the
   `blocks_cancel` rows `doctor:arrival_assisted` and `doctor:arrival_verified`, as contract
   A9.4's insert-only extension model allows. Suggested owner fix: restrict those assertions to
   the shared codes.
3. **Scratch-DB runners and category schemas.** `run_p5s_concurrency.py` does not drop
   `doctor_private` or `payments_*`, and `run_p01_concurrency.py` does not drop
   `doctor_private`. On a DB reset with all migrations, their migration replay fails on
   `create schema`. The doctor runner works around this locally (item 4 above).
4. Design 7.1 kept the unkeyed `advance_visit` signature. Contract A13.2 requires the key, and
   the contract wins. The doctor commands also call `assignee_finish`, `open_exception` and the
   shared ops RPCs instead of design 5.2/7.4-7.6 (contract A15).

## Not built, and why

- Design 5.2 `doctor_visit_exceptions`, 7.4 `resolve_doctor_visit_exception`, 7.5
  `close_overdue_doctor_visit`, 7.6 `list_doctor_visit_exceptions`, the ops doctor routes and
  D21-D27/D35: replaced by the shared `booking_exceptions`, `ops_close_booking`,
  `ops_resolve_exception`, `list_booking_exceptions` and `/api/ops/*` (contract A15). They are
  tested in shared suite 022 and the shared runner.
- `GET /api/bookings/:id/contact`: the shared block owns it as `POST /api/bookings/[id]/contact`.
- `isEnabled('doctorVisits')` env flag: removed by contract A10.1; the DB gate replaces it.
- Patient and doctor UI pages, copy rules (design 11.3 copy items, 112 line in en/hi/te) and the
  Playwright journeys (11.4): UI is outside this ticket and pending frontend handover.
- D37 (no `supabase_realtime` publication for the visit tables): no assertion written;
  publications are not changed by any migration here.
- Fallback procedure activation: gate `doctor_arrival_fallback` stays off pending owner
  decision Q09.

## Security notes

No plaintext arrival code is stored, logged, audited or written to the outbox. The code
derivation depends on the protected per-database key in `doctor_private.arrival_key`. Every
doctor RPC is SECURITY DEFINER with an empty search_path and is executable by `authenticated`
only. Synthetic fixtures only.
