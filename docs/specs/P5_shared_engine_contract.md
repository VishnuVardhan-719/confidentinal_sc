# P5 shared-engine contract

_Phase 5 · contract v1.0 · 19 November 2026 · Kiro · branch `docs/P5-shared-engine-contract`, base `integ/all` at `e7165fd` · Owner review PENDING_

This document decides the shared booking-engine behaviour that the doctor, lab, ambulance and caretaker Phase 5 flows build on. It answers review findings P5-01, P5-02, P5-03, P5-04, P5-06, P5-07, P5-08, P5-09, P5-12 and P5-15 from `C:\tmp\scv_logs\review_P5.md`. Each finding gets one answer, the reasoning, and the SQL-level shape (objects, function signatures, grants). An agent should be able to write the shared migration block from §3 to §13 without reopening the four designs.

It is a design document. It contains no SQL file, no code, and nothing in it has been run. No database or Docker command was used to write it. Every statement about the built engine comes from reading the migrations on `e7165fd`, whose inventory ends at `20261117001500_review_findings.sql`.

Where a call belongs to the owner, it is marked **OWNER-DECISION** with the default this contract uses until the owner answers. §14 collects them.

## 0. Sources

| Alias | Source |
|---|---|
| R | `C:\tmp\scv_logs\review_P5.md` (Codex, 19 November 2026) |
| D | `origin/task/P5-doctor-design:docs/specs/P5_doctor_flow_design.md` (`90ecfde`) |
| L | `origin/task/P5-lab-design:docs/specs/P5_lab_flow_design.md` (`280e4bc`) |
| A | `origin/task/P5-ambulance-design:docs/specs/P5_ambulance_flow_design.md` (`4b3bf77`) |
| C | `origin/task/P5-care-design:docs/specs/P5_care_flow_design.md` (`74f5cc1`) |
| M05 | `supabase/migrations/202611170005_b01_booking.sql` |
| M10 | `supabase/migrations/20261117001000_q06_staff_credentials.sql` |
| M11 | `supabase/migrations/20261117001100_b01_authorization_limits.sql` |
| M13 | `supabase/migrations/20261117001300_availability_by_reference.sql` |
| M15 | `supabase/migrations/20261117001500_review_findings.sql` |
| M0610, M0660 | `20261117000610_i02h_audit_hardening.sql` (`has_capability`), `20261117000660_i02h_document_read_and_suspend.sql` (capability CHECK) |

### 0.1 Built facts this contract depends on

| Fact | Where |
|---|---|
| `booking_transitions(from_state, to_state, actor_kind)` has no category. `actor_kind` CHECK is `patient, provider, assigned, system`. Provider edge `confirmed -> no_show` exists. | M05 L52-64 |
| `guard_booking` derives one actor kind from the target state (`in_progress/completed/interrupted` = assigned, `accepted/confirmed/declined/no_show` = provider) and accepts an assignee of any purpose. | M11 L28-55 |
| `booking_events.reason` is an inline CHECK of 12 codes. | M05 L69 |
| `resource_reservations` has a GiST exclusion on `(resource_id, occupied_period)` where `status = 'active'`, and no guard trigger. | M05 L108-114 |
| `booking_private.release()` releases reservations and ends assignments. Built callers: `cancel_booking`, `advance_visit` at `service_completed`. | M05 L218-221, M11 L196, L221 |
| `upsert_booking_resource` (disable) and `set_booking_availability` (rule edit) raise `resource_in_use` for any `active` reservation, with no time test. | M05 L484, L505 |
| `is_assigned` window is `[start_at - 60 min, end_at + 12 h)`, requires `provider_is_publishable` and `resource_eligible`; only the doctor branch adds `person_is_verified`. `resource_eligible` verifies persons only for doctor providers. | M11 L5-26 |
| `person_is_verified` requires `provider_is_publishable`, so a provider suspension fails it. Staff evidence uses `required_kind(category)`, which is `vehicle_permit` for ambulance. | M10 L62-82, M15 L49-50 |
| `get_booking` (latest) returns `provider_reference`, `service_id`, `amount_paise`, `currency`, `terms_version`, `policy_version_id` to every authorized viewer, and address, contact and `patient_id` to the patient, the scheduler and any assignee inside the window. | M15 L58-78 |
| `authenticated` holds table SELECT on `bookings`, `booking_events`, `booking_assignments`, `resource_reservations`, `doctor_visits`, with patient and self-assignment policies. | M05 L560-573 |
| `idempotency_requests(actor_profile_id, action, request_key, request_hash, result_id)` unique on the first three. | `202611170001` L112-117 |
| `admin_capabilities_capability_check` lists six values. `has_capability(capability, org)` requires AAL2 and matches `global` or `org:<id>` scope. | M0660 L13-16, M0610 L12-25 |
| `list_slots(text, uuid, date)` delegates to `list_slots(uuid, uuid, date)`. | M13 |

## 1. Rules for every P5 migration

These rules apply to the shared block and to all four category blocks. They exist so four authors can write disjoint files without overwriting each other.

1. **Additive extension only.** A category migration never runs `create or replace` or `drop` on a function, trigger, policy or constraint defined outside its own schema and range. It extends shared behaviour by inserting registry rows (§3), adding category-scoped triggers (`... when (old.category = '<category>')`), or calling shared private helpers. The one exception is `public.advance_visit`, which is doctor-only and owned by the doctor block.
2. **Grants.** Every new or replaced function ends with `revoke all on function <sig> from public, anon, authenticated, service_role;` and then grants only what this contract lists. `create or replace` keeps old grants, so replaced functions re-assert the revoke (R P5-20). Every new table gets RLS enabled and `revoke all ... from public, anon, authenticated, service_role`.
3. **Definer hygiene.** `security definer`, `set search_path = ''`, first statement `identity_private.require_actor()` for every public RPC that a signed-in user calls.
4. **Time.** `clock_timestamp()` for every rule in this contract. Booking event times stay `now()` as built.
5. **Errors.** `42501 forbidden`, `P0002 not_found`, `40001 stale_version | idempotency_conflict | offer_changed | schedule_changed`, `55000` for state, gate and timing, `22023 invalid_input | invalid_reason`, `53300` for limits, `23P01` exclusion conflict. New messages in this contract: `resource_busy`, `use_category_command`, `feature_unavailable`, `feature_suspended`, `exception_open`, `not_escalatable`, `invalid_reservation`, `immutable_reservation`.
6. **Guarantee scope.** Every guarantee here holds for `anon`, `authenticated` and `service_role`. The table owner can disable triggers; this contract claims nothing about the owner.

## 2. P5-07: authoritative migration and test manifest

### 2.1 Decision

One manifest, below, replaces the numbering sections of all four designs (D §2.2, L §5.1, A §3.1, C §4.0). The shared block lives in `20261117001550` to `20261117001599`, below every category file, so no category range is shared. Every version is 14 digits with the 12-digit prefix `2026111700NN` above `202611170005`, which keeps filename, string and numeric order identical (`tests/rls/README.md`).

Reasoning: the review's collision was lab reserving all of `0016xx` for shared work while doctor used `001610`+. Putting shared prerequisites in their own block under `001600` removes the overlap without renumbering any existing file, and lets the doctor block keep its proposed file numbers.

### 2.2 Migrations

| Version range | Owner | Files |
|---|---|---|
| `20261117001550` | Shared (one author) | `20261117001550_p5s_registries.sql`: feature gates, reason registry, category paths, idempotency result version, replay helpers (§3, §9, §10.2, §13) |
| `20261117001560` | Shared | `20261117001560_p5s_authority.sql`: capability CHECK, category-scoped transitions, actor and closeout predicates, `guard_booking`, staff evidence kind (P5-05), verified assignees (§4, §5, §6.2, §8.2) |
| `20261117001570` | Shared | `20261117001570_p5s_resources_exceptions.sql`: exceptions, assignment end/release, resource-busy guard, `resource_in_use` fix, ops commands (§6.3, §6.4, §11, §12) |
| `20261117001580` | Shared | `20261117001580_p5s_projections.sql`: `get_booking` key sets, `get_assignment_contact`, base-table revokes (§8.3 to §8.5) |
| `20261117001590` | Shared | `20261117001590_p5s_admission.sql`: `create_request_core`, generic create/accept/cancel/list_slots rewrites (§7) |
| `20261117001591` to `001599` | Shared | Reserved for shared review fixes, and for owner-approved shared items not decided here (§2.5). |
| `20261117001600` to `001699` | Doctor | D's `001610`, `001620`, `001630`, `001640` keep their numbers; `001600` to `001609` are now unused doctor space; `001650` to `001699` doctor fixes. `001630` shrinks to doctor-only reads, because ops commands are shared (§6). |
| `20261117001700` to `001799` | Lab | L's `001700`, `001710`, `001720`; `001730` to `001799` lab fixes. |
| `20261117001800` to `001899` | Ambulance | A's `001800`, `001810`, `001820`; `001830` to `001899` ambulance fixes. |
| `20261117001900` to `001999` | Caretaker | C's `001900`, `001910`, `001920`; `001930` to `001999` care fixes. |
| `20261117002000` to `002099` | P01 payments | P01a and P01b files. P01 adds its finance capability values by rebuilding the capability CHECK from the then-current list, which after `001560` is seven values. |

Dependencies: every category block requires the whole shared block. Category blocks never reference each other's objects, so filename order between them carries no meaning. Each category file starts with a preflight that raises if a shared object it uses is missing (for example `to_regprocedure('booking_private.require_gate(text,text)') is null`).

Authoring order: AGENTS.md forbids simultaneous migration authors, so the order is shared, then doctor, lab, ambulance, care, then P01. Each block merges before the next author starts SQL.

### 2.3 SQL test suites (`supabase/tests/NNN_<name>.test.sql`)

| Suite numbers | Owner | Notes |
|---|---|---|
| `001` to `016` | Built | The shared ticket edits these where §7.5 says so. No other ticket edits them. |
| `020` to `029` | Shared | Proposed: `020_p5s_transitions`, `021_p5s_resource_busy`, `022_p5s_closeout_ops`, `023_p5s_gates`, `024_p5s_projections`, `025_p5s_reasons`, `026_p5s_replay`, `027_p5s_release`. |
| `030` to `039` | Doctor | Replaces D's `160` to `163`. |
| `040` to `049` | Lab | Replaces L's `020` to `024`. |
| `050` to `059` | Ambulance | Replaces A's `030` to `034`. |
| `060` to `069` | Caretaker | Replaces C's `019`. |
| `070` to `089` | P01 | Replaces P01's `p01a_*` names. |
| `090` to `099` | Integration coordinator (Claude) | `090_p5_reason_integration` and other cross-category checks written after all four blocks merge (§9.5). |

Fixture includes follow the same blocks: `_p5s_fixture.inc` (shared), `_p5d_`, `_p5l_`, `_p5a_`, `_p5c_fixture.inc`. Each extends `_b01_fixture.inc` and never edits it; only the shared ticket edits `_b01_fixture.inc` (§7.5).

Concurrency runners: `tests/rls/run_p5s_concurrency.py`, `run_p5d_`, `run_p5l_`, `run_p5a_`, `run_p5c_concurrency.py`. Each imports helpers from `tests/rls/run_b01_concurrency.py`. Only the shared ticket may edit `run_b01_concurrency.py`, for example to make its helpers importable (R P5-22).

### 2.4 What each block owns

| Object kind | Shared block | Category blocks |
|---|---|---|
| `booking_transitions` rows | Seeds the full matrix in §4 | None. A change needs a shared fix file. |
| Reason codes | Built 12 plus cross-category and ops codes (§9) | Their own codes and `category_reasons` rows, `on conflict do nothing` |
| Exception kinds | All kinds named in §6.3 | New kinds by insert only |
| `category_paths` row | Seeds all four | Care flips `generic_accept` (§7.2) |
| Generic RPCs (`create_booking_request`, `accept_booking`, `cancel_booking`, `decline_booking`, `get_booking`, `list_bookings`, `list_slots`) | Owns | Never replaced |
| Category RPCs and tables | None | Own |

### 2.5 Shared items not decided here

These were raised by the designs but are outside the ten findings this contract answers. They need an owner or coordinator decision before anyone writes them, and then land in `001591` to `001599`:

- Stale `requested` bookings and the pending cap (D B-13, L SP-5, A AMB-Q13).
- Per-category lead time, horizon and buffers in the generic path (D B-11). Lab and ambulance keep their own values in their own commands.
- `service_role` write revokes on B01 tables (A E-9).
- Reassignment (S01-17) and reschedule.

P5-05 (ambulance staff evidence kind) is included in `001560` because §8.2 makes every assignee pass `person_is_verified`, which would break ambulance drivers without it.

## 3. Registries (file `001550`)

All registry tables live in `booking_private`. None has a client grant. All are written only by migrations.

| Object | Shape |
|---|---|
| `booking_private.feature_gates` | `key text primary key check (key ~ '^[a-z][a-z0-9_]{1,31}$')`, `state text not null default 'off' check (state in ('off','on','suspended'))`, `version integer not null default 1 check (version > 0)`, `changed_at timestamptz not null default clock_timestamp()`. Seeded `doctor`, `lab`, `ambulance`, `caretaker`, all `off` (§10). P01 may insert its own key. |
| `booking_private.feature_gate_events` | `id uuid pk`, `key text not null`, `from_state text`, `to_state text not null`, `version integer not null`, `changed_at timestamptz not null default clock_timestamp()`, `db_role text not null default current_user`. Immutable (reuse `booking_private.immutable()` for UPDATE, DELETE, TRUNCATE). Written by an AFTER INSERT OR UPDATE trigger on `feature_gates`. A trigger also forces `version = old.version + 1` on update. |
| `booking_private.reason_codes` | `code text primary key check (code ~ '^[a-z][a-z0-9_]{1,47}$')`. UPDATE, DELETE, TRUNCATE raise. |
| `booking_private.category_reasons` | `category text not null check (category in ('doctor','lab','ambulance','caretaker'))`, `code text not null references booking_private.reason_codes(code)`, `blocks_cancel boolean not null default false`, `primary key (category, code)`. UPDATE, DELETE, TRUNCATE raise. |
| `booking_private.category_paths` | `category text primary key` (same CHECK), `generic_create boolean not null`, `generic_accept boolean not null`, `assignee_close text not null check (assignee_close in ('release','end_assignments'))`. Seed in §7.2. DELETE, TRUNCATE raise; UPDATE allowed for migrations. |
| `public.idempotency_requests` | `alter table ... add column result_version integer check (result_version > 0)`. Nullable, so built rows stay valid. |

## 4. P5-01: transition authority (file `001560`)

### 4.1 Decision

`booking_transitions` becomes category-scoped, and `guard_booking` accepts a state change when **any** actor kind the caller currently holds has a row for `(booking category, from, to)`. The provider `confirmed -> no_show` edge is removed for every category. `no_show` is an `ops` edge for doctor, lab and ambulance, and caretaker has no `no_show` edge at all.

Reasoning:
- One global edge cannot serve doctor/ambulance (no provider no-show) and lab (provider no-show) at once. Scoping rows by category makes each category's authority a data row, so the owner's answer for lab (OD-1) is a one-row change instead of a guard rewrite.
- The canonical rule is that support validates no-show evidence (C §6.5 cites canonical L402), Q02 forbids penalties, and two of four designs already route absence to ops. A lab-only provider path would also leave solo labs unable to confirm (L E9).
- Deriving one actor kind from the target state, as built, cannot express "completed by the assignee or by closeout" or "interrupted by assignee, closeout or ops". Checking every held kind can.

**OWNER-DECISION OD-1:** may a lab scheduler other than the reporter confirm `no_show` (L D7, LAB-Q06)? Default: no, ops only. If the owner says yes, the shared fix inserts `('lab','confirmed','no_show','provider')` and lab's command enforces reporter ≠ confirmer.

### 4.2 Table shape

```text
public.booking_transitions                       -- rebuilt in place
  category    text not null check (category in ('doctor','lab','ambulance','caretaker'))
  from_state  text not null
  to_state    text not null
  actor_kind  text not null check (actor_kind in ('patient','provider','assigned','closeout','ops','system'))
  primary key (category, from_state, to_state, actor_kind)
```

Migration steps: drop the old primary key and `actor_kind` CHECK, `delete from public.booking_transitions`, add `category`, add the new key and CHECK, insert the matrix. RLS and grants stay as built (no client access).

### 4.3 Transition matrix

Rows marked "all" are inserted once per category.

| From | To | Actor kind | Categories | Change from built |
|---|---|---|---|---|
| `draft` | `requested`, `cancelled` | patient | all | same |
| `requested` | `cancelled` | patient, provider | all | same |
| `requested` | `declined`, `accepted` | provider | all | same |
| `requested` | `expired` | system | all | same (never satisfiable) |
| `accepted` | `confirmed` | provider | all | same |
| `accepted` | `cancelled` | patient, provider | all | same |
| `confirmed` | `cancelled` | patient, provider | all | same |
| `confirmed` | `cancelled` | assigned | doctor | was a special case in the guard (M11 L46-47) |
| `confirmed` | `in_progress` | assigned | all | same |
| `confirmed` | `interrupted` | assigned | doctor, ambulance | new (D B-4, A E-4) |
| `confirmed` | `interrupted` | ops | all | new (§6) |
| `confirmed` | `no_show` | ops | doctor, lab, ambulance | new; provider edge removed for all |
| `in_progress` | `completed` | assigned, closeout | all | closeout new (§5) |
| `in_progress` | `interrupted` | assigned, closeout, ops | all | closeout and ops new |

Ops never produces `completed`: ops cannot attest that a service happened.

### 4.4 Predicates and guard

| Function | Signature | Body (contract) |
|---|---|---|
| `booking_private.person_purpose` | `(p_category text) returns text`, immutable | `doctor -> doctor_visit`, `lab -> lab_collection`, `caretaker -> caretaker`, `ambulance -> driver`, else null. |
| `booking_private.actor_holds` | `(p_kind text, p_booking public.bookings) returns boolean`, volatile definer | `patient`: `booking_private.patient(patient_id,'booking:create')`. `provider`: `booking_private.scheduler(provider_id)`. `assigned`: `identity_private.is_assigned(id, person_purpose(category))`. `closeout`: `booking_private.closeout_assignee(id)` (§5). `ops`: `booking_private.ops_actor(id)` (§6). `system` and anything else: false. |
| `booking_private.guard_booking()` | trigger, replaced | INSERT, DELETE, snapshot-immutability and version rules unchanged. On a state change: raise `55000 invalid_transition` unless `exists (select 1 from public.booking_transitions t where t.category = old.category and t.from_state = old.state and t.to_state = new.state and booking_private.actor_holds(t.actor_kind, old))`. |

Commands keep their own checks (windows, reasons, substates). The guard is the backstop that a direct definer bug or a new command cannot bypass.

Grants: all three functions revoked from `public, anon, authenticated, service_role`; no grants.

### 4.5 Tests (suite `020`)

- Every row of §4.3 succeeds for a caller holding exactly that kind, and fails for a caller holding none, per category.
- `confirmed -> no_show` by a scheduler: `55000` for all four categories. By ops: succeeds for doctor, lab, ambulance; `55000` for caretaker.
- Lab no-show through the shared ops path (§6) next to direct provider denial for doctor and ambulance (R P5-01 fix).
- A doctor assignee who is not the scheduler can cancel `confirmed`; a lab, ambulance or care assignee cannot.
- An assignee of the wrong purpose (a lab technician resource on an ambulance booking) cannot move `confirmed -> in_progress`.

## 5. P5-03 part 1: assignee closeout (file `001560`)

### 5.1 Decision

One shared closeout predicate lets the assigned person close work that is already `in_progress`, after the assignee window closes, after provider suspension and after credential expiry, but not after the person loses membership or account status. Everything the closeout predicate cannot reach goes to the audited ops path in §6. Closing through closeout while the normal assignee predicate fails opens a `closed_while_ineligible` exception, so the reported completion stays distinguishable from a fully authorised one.

Reasoning: A (E-5) and D (B-2) already need this; L (E15) and C (E8) need it to stop custody and sessions staying open forever. Membership and account status stay required because they are the provider's and the platform's offboarding controls; removing them would let a dismissed worker write to a booking. That residual is what ops covers.

### 5.2 Shape

| Function | Signature | Contract |
|---|---|---|
| `booking_private.closeout_assignee` | `(p_booking_id uuid) returns boolean` | `identity_private.active_account()` and exists booking `b` in `in_progress`, an active assignment `a` with `a.purpose = person_purpose(b.category)`, `a.assigned_profile_id = auth.uid()`, resource `r` with `r.kind = 'person'`, `r.status = 'active'`, `r.person_profile_id = auth.uid()`, and the caller is `providers.individual_owner_profile_id` or an `organization_members` row with `status = 'active'`, `accepted_at is not null`, `'provider:read' = any(scopes)` in an organisation with `status = 'active'`. No time window, no `provider_is_publishable`, no `person_is_verified`. |
| `booking_private.closeout_possible` | `(p_booking_id uuid) returns boolean` | The same predicate evaluated for the assigned person instead of `auth.uid()` (account status from `profiles.status`). Used only by §6.4. |
| `booking_private.assignee_finish` | `(p_booking_id uuid, p_next_state text, p_reason text, p_request_key uuid) returns integer` | Called by category commands for assignee terminal steps after their own locks and checks. `p_next_state in ('completed','interrupted')`. Computes `eligible := identity_private.is_assigned(id, person_purpose(category))` **before** the transition, then `booking_private.transition(...)`, then if not `eligible` calls `open_exception(id, 'closed_while_ineligible', p_reason)`, then `finish_assignments(id)` (§12). Returns the new booking version. |

Grants: revoked from all API roles; no grants.

Category commands decide which steps use closeout: only steps from `in_progress` (doctor `service_completed` and in-visit interruption, lab `collected -> handed_over` and both failures from `collecting/collected`, ambulance `destination_reached` and on-board interruption, care `ended` and `interrupt_care`). Pre-start steps (`confirmed`) keep the normal assignee predicate.

### 5.3 Tests (suite `022`)

For each category, with the booking `in_progress`: (a) provider suspended, (b) Q06 case expired, (c) clock past `end_at + 12 h`: the assignee closes and one `closed_while_ineligible` exception opens. (d) membership disabled, (e) account disabled: closeout `42501`, and §6 ops close succeeds. A different member of the same provider can never close.

## 6. P5-03 part 2: audited ops escalation (files `001560`, `001570`)

### 6.1 Decision

Ops escalation is shared. One capability (`booking:incident`), one exceptions table (`public.booking_exceptions`) and three RPCs serve all four categories. The category-specific ops commands in the designs are replaced: D's `resolve_doctor_visit_exception`, `close_overdue_doctor_visit`, `list_doctor_visit_exceptions`; A's `ops_interrupt_trip`, `resolve_trip_absence`, `close_trip_exception`, `list_trip_exceptions`; L's `lab_confirm_no_show`. Lab follow-ups (`lab_close_followup`) stay lab-owned, because they are provider first-line support and change no booking state.

Ops changes only `bookings.state` and exceptions. It never writes a category substate. Rule for every category table: **the substate is the last milestone reported by the assignee; `bookings.state` is the lifecycle authority.** Category projections derive patient labels from both. Category guard triggers must not require a particular substate when the booking is terminal.

Reasoning: four ops implementations would mean four predicates for one sensitive capability. Lab and care had no ops path at all (R P5-03). Keeping ops out of substates is what lets one command serve four different substate machines.

### 6.2 Capability and ops predicate (file `001560`)

- Rebuild `admin_capabilities_capability_check` from the six built values (M0660 L15-16) plus `booking:incident`. Suite `022` asserts all seven insert.
- `booking_private.ops_actor(p_booking_id uuid) returns boolean`: `identity_private.active_account()` and, for booking `b` with provider `p` and patient `pt`: `coalesce(identity_private.has_capability('booking:incident', p.organization_id), false)`; `p.individual_owner_profile_id is distinct from auth.uid()`; no `organization_members` row of any status for `p.organization_id` and `auth.uid()`; `pt.self_profile_id is distinct from auth.uid()`; `b.requester_profile_id <> auth.uid()`; no `booking_assignments` row of any status for `b.id` with `assigned_profile_id = auth.uid()`. For an individual provider, `organization_id` is null, so only a `global` grant matches.
- Ops commands also lock the caller's capability row `for share` (as `review_provider` does, M0660 L55).

**OWNER-DECISION OD-2:** who holds `booking:incident`, and in which hours (D DQ-08, A AMB-Q11, C Q-CARE-07)? Default: nobody. Until a holder is named, no gate may be set `on` outside synthetic staging, and all four flows are labelled synthetic demonstrations with the limitation "work the assignee cannot close stays open until an ops holder exists". No 24/7 promise.

### 6.3 `public.booking_exceptions` (file `001570`)

```text
booking_private.exception_kinds
  code              text primary key
  blocks_resources  boolean not null
  resolutions       text[] not null          -- allowed resolution codes
  seeded: absence_reported         false  {no_show_confirmed, absence_disputed}
          interrupted              false  {resolved}
          interrupted_after_pickup true   {resolved}
          eligibility_lapsed       false  {resolved}
          closed_while_ineligible  false  {resolved}

public.booking_exceptions
  id                      uuid primary key default gen_random_uuid()
  booking_id              uuid not null references public.bookings(id)
  kind                    text not null references booking_private.exception_kinds(code)
  reason                  text not null references booking_private.reason_codes(code)
  opened_by_profile_id    uuid not null references public.profiles(id)
  opened_at               timestamptz not null default clock_timestamp()
  status                  text not null default 'open' check (status in ('open','resolved'))
  resolution              text
  resolved_by_profile_id  uuid references public.profiles(id)
  resolved_at             timestamptz
  version                 integer not null default 1 check (version > 0)
  check ((status = 'open' and resolution is null and resolved_by_profile_id is null and resolved_at is null)
      or (status = 'resolved' and resolution is not null and resolved_by_profile_id is not null and resolved_at is not null))
  check (resolved_by_profile_id is null or resolved_by_profile_id <> opened_by_profile_id)
  unique index on (booking_id, kind) where status = 'open'
```

- Guard trigger (BEFORE UPDATE OR DELETE, BEFORE TRUNCATE): DELETE and TRUNCATE raise; UPDATE only `open -> resolved` with `version = old.version + 1`, `resolution = any(kind.resolutions)`, every other column unchanged.
- The exhaustive status CHECK is the fix pattern for R P5-21.
- RLS on, no policy, no grants to any API role. No free-text column.
- `booking_private.open_exception(p_booking_id uuid, p_kind text, p_reason text) returns uuid`: inserts with `opened_by_profile_id = auth.uid()`; a second open exception of the same kind raises `55000 exception_open`. A caller opening a `blocks_resources` kind must already hold the booking's resource row locks (lock order in §11.4). Not granted.

D's `doctor_visit_exceptions` and A's `trip_exceptions` are not created. Their columns map one to one onto this table.

### 6.4 Ops RPCs (file `001570`)

All three: `security definer`, `search_path = ''`, `require_actor()` first, `revoke all from public, anon, authenticated, service_role`, `grant execute to authenticated`. Replay per §11.

**`public.ops_close_booking(p_booking_id uuid, p_expected_version integer, p_outcome text, p_reason text, p_request_key uuid) returns integer`** (new booking version)
1. Inputs not null; `p_outcome in ('interrupted','no_show')`.
2. Replay (§13.1, action `p5.ops.close`).
3. `ops_actor(p_booking_id)` else `42501`. Lock booking, `lock_provider`, active-assignment resources `order by id for update`, open exceptions `for update`, capability row `for share`. Recheck `ops_actor`. Version check.
4. Booking state `confirmed` or `in_progress`, else `55000 invalid_transition`.
5. Escalatable, else `55000 not_escalatable`: (a) an open exception exists on the booking; or (b) `clock_timestamp() >= end_at + interval '12 hours'`; or (c) the booking is `in_progress` and `not booking_private.closeout_possible(id)`.
6. `no_show`: requires state `confirmed` and an open `absence_reported` exception; `p_reason = 'no_show_confirmed'`. `interrupted`: `p_reason in ('ops_closeout','provider_did_not_attend','unsafe_conditions','absence_disputed')`; `absence_disputed` requires an open `absence_reported` exception. Else `22023 invalid_reason`.
7. `booking_private.transition(id, p_outcome, p_reason, p_request_key)` (the guard sees the `ops` kind), then `end_assignments(id)`, then resolve every open exception on the booking: `absence_reported` gets `no_show_confirmed` or `absence_disputed`, others get `resolved`; resolver is the caller. Audit `booking.ops_closed` comes from `transition()`; each resolved exception also writes `audit_events(actor, 'booking.exception_resolved', 'booking_exception', id)`.

**OWNER-DECISION OD-8:** when may ops close a booking without an open exception? Default: condition (b) or (c) above. Ops may not override a live visit early without a recorded trigger. A's "ops interrupts any time" and A's `not_started` after `end_at` both wait for (b).

**`public.ops_resolve_exception(p_exception_id uuid, p_expected_version integer, p_resolution text, p_request_key uuid) returns integer`** (new exception version)
- For exceptions that need no booking change. Ops predicate on the exception's booking; lock exception `for update`; version; `p_resolution = any(kind.resolutions)` and the kind is not `absence_reported` (that one resolves only through `ops_close_booking`), else `55000 invalid_transition`. Resolving an `interrupted_after_pickup` exception unblocks its resources (§11).

**`public.list_booking_exceptions(p_limit integer default 20, p_after_booking uuid default null) returns setof jsonb`**
- `p_limit` 1 to 50 else `22023`. Rows ordered by booking id, one per booking where `ops_actor(booking)` holds and (an open exception exists, or the booking is overdue by §11.1, or §6.4 condition (b) or (c) holds).
- Row keys exactly: `booking_id`, `public_ref`, `provider_reference`, `category`, `start_at`, `end_at`, `state`, `version`, `last_reason` (latest `booking_events.reason`), `overdue` (boolean), `escalatable` (boolean), `exceptions` (array of `{id, kind, reason, opened_at, version}`).
- No address, phone, patient id, patient name, actor ids, resource ids, amounts or clinical data. Writes no audit row.

### 6.5 Tests (suite `022`)

- Ops without AAL2, without the capability, with an org grant for another org, with any membership row (including `invited` and `disabled`), as the individual owner, the patient, the requester or any past assignee: `42501`.
- `not_escalatable` before conditions (a) to (c); success after each one separately.
- `no_show` without an absence exception, `no_show` on caretaker, `absence_disputed` without an absence exception: rejected.
- After ops close: assignments `ended`, reservations untouched, all open exceptions resolved with the right codes, category substate unchanged.
- Two ops callers race one booking: one wins, the other `40001`. Ops close racing an assignee completion: exactly one commits.
- `list_booking_exceptions` key set equals the list above for every row.

## 7. Admission paths, generic commands and gating hooks (file `001590`)

These are not one of the ten findings, but P5-02 and P5-04 cannot be enforced without fixing which commands can create and accept which category.

### 7.1 Decision

| Category | Create | Accept | Slots |
|---|---|---|---|
| doctor | generic `create_booking_request` | generic `accept_booking` | generic `list_slots` |
| caretaker | generic (care's AFTER INSERT trigger snapshots the plan) | generic, enabled by care's migration (§7.2) | generic |
| lab | `create_lab_booking_request` calling `booking_private.create_request_core` | `accept_lab_booking` | `list_lab_slots` |
| ambulance | `request_transport` calling `create_request_core` | `accept_transport` | `list_transport_slots` |

Generic create, accept and slots refuse lab and ambulance with `55000 use_category_command` (slots return no rows). Suite `013` stays a `55000` regression.

Reasoning: L D3 and A E-1 both need the generic path closed for their category, but L's command calls the public `create_booking_request` internally. A shared private core removes that conflict without a session flag, and A's request for extracted cores (E-2) is met for create. Accept is not extracted: the reservation guard in §11 makes the cross-category safety independent of who writes the accept command.

### 7.2 `category_paths` seed

| category | generic_create | generic_accept | assignee_close |
|---|---|---|---|
| doctor | true | true | end_assignments |
| caretaker | true | false | release |
| lab | false | false | release |
| ambulance | false | false | end_assignments |

The care migration sets `generic_accept = true` for `caretaker` after installing its accept triggers (`before update on public.bookings when (old.category = 'caretaker' and new.state = 'accepted')` for C's `accept_check`, and `... new.state = 'confirmed'` for `after_accept`). That replaces C's SH-1 dispatch without editing `accept_booking`.

### 7.3 Signatures

| Function | Contract |
|---|---|
| `booking_private.create_request_core(p_patient_id uuid, p_service_id uuid, p_address_id uuid, p_start_at timestamptz, p_request_key uuid, p_action text, p_request_hash text, p_min_lead interval, p_horizon interval) returns uuid` | The built `create_booking_request` body (M11 L80-121): patient check, patient-row lock, recheck, address, replay under `p_action`/`p_request_hash`, `p_start_at > clock_timestamp() + p_min_lead` and `<= clock_timestamp() + p_horizon` (`22023`), 10-request cap, provider lock, coverage, price, policy, insert, `transition(...,'requested','requested',key)`, `record_request(...)`. No gate check (callers do it). Not granted. |
| `public.create_booking_request(p_patient_id uuid, p_service_id uuid, p_address_id uuid, p_start_at timestamptz, p_request_key uuid) returns uuid` (same signature) | Replay first under `booking.create` with the built hash. Then read the service category: `category_paths.generic_create` false: `55000 use_category_command`. `require_gate(category,'admission')`. Then `create_request_core(..., 'booking.create', hash, interval '0', interval '90 days')`. Grant `authenticated`. |
| `public.accept_booking(p_booking_id uuid, p_expected_version integer, p_resource_ids uuid[]) returns integer` (same signature) | Built body (M11 L124-171) with these changes: after the version check, `category_paths.generic_accept` false: `55000 use_category_command` (replaces `category_deferred_to_s01`); `require_gate(category,'admission')`; purpose from `person_purpose(category)`. Reservation inserts are subject to §11.2. Grant `authenticated`. |
| `public.cancel_booking(p_booking_id uuid, p_expected_version integer, p_reason text) returns integer` (same signature) | Built body plus, after the state check: raise `55000 invalid_transition` if any `booking_events` row of the booking has a `(category, reason)` with `blocks_cancel = true` (D B-12, A E-6, L D4). No gate check (closeout phase). Release stays `release()`. Grant `authenticated`. |
| `public.list_slots(p_provider_id uuid, p_service_id uuid, p_date date)` (same signature) | Returns no rows unless `generic_create` is true for the service category and `gate_state(category) = 'on'`. Candidate resources exclude `booking_private.resource_busy(r.id)`. The `text` overload (M13) delegates and is not changed. Grant `authenticated`. |
| `public.decline_booking` | Unchanged. |

### 7.4 Tests

Suite `023` covers gates (§10.4). Suite `021` covers busy exclusion in slots. Suite `013` (edited, §7.5) asserts generic create, accept and slots for lab and ambulance return `55000` or no rows with the gate on and off.

### 7.5 Edits to built suites (shared ticket only)

- `_b01_fixture.inc`: owner-context `update booking_private.feature_gates set state = 'on'` for the categories each suite exercises; Q06 approved cases for lab, care and ambulance person resources (needed by §8.1).
- `005`, `012`: lines asserting patient or provider `count(*) from public.bookings` become `expect_state(..., '42501', ...)` (§8.3). Line 104 (`completion releases reservations`) becomes "completion ends assignments and keeps the reservation" once the doctor block replaces `advance_visit`; until then it stays.
- `013`: rewritten per R P5-16. Generic lab and ambulance create are asserted as `55000 use_category_command` on their own; caretaker setup runs with the gate on and asserts acceptance is `55000` until care's migration flips `generic_accept`.
- `015`, `016` stay in the regression list.

## 8. P5-06 and P5-12: contact authorization, projection and audit (files `001560`, `001580`)

### 8.1 Decision

Address, contact and `patient_id` leave the generic booking reads for everyone except the patient. Assignees in all four categories read address and contact through one shared RPC, `public.get_assignment_contact`, which writes one audit row per call. Every assignee must pass Q06 person verification in every category. The generic projection gives each viewer an exact key set, and the assignee set has no amount, currency, terms, service id or patient id. Base-table SELECT on booking tables is revoked from `authenticated`.

Reasoning:
- D and A need assignee-only contact with an audited read; L and C relied on the generic path. Moving everyone to one audited RPC satisfies the stronger requirement and gives L and C an explicit contact source (R P5-06 fix).
- Requiring verification for every assignee closes L D10, C SH-2 and the residual where an unverified agency member reads a patient's address. It needs P5-05's staff evidence fix in the same file.
- One key set rule for assignees satisfies L's promise that the technician never sees an amount, for every RPC, not only lab's projection (R P5-12).
- Revoking base-table SELECT is simpler than column grants and closes the patient-side identifier exposure R P5-23 keeps distinct (`actor_profile_id`, `request_key`, `assignment_id`, `requester_profile_id`).

**OWNER-DECISION OD-4:** may provider schedulers see exact address and phone (C Q-CARE-06)? Default: no. Schedulers see PIN only. An agency coordinates through the assignee.

**OWNER-DECISION OD-3:** may an ops holder read contact while handling an exception (A §7.4)? Default: yes, only while the booking has an open exception or is escalatable by §6.4, audited as `booking.contact_viewed_ops`.

**OWNER-DECISION OD-9:** may an assignee see the booking amount (for example a pay-after collector)? Default: no. P01 adds its own collector projection under its own review.

### 8.2 Verified assignees (file `001560`)

| Object | Change |
|---|---|
| `providers_private.required_staff_kind(p_category text) returns text`, immutable | `doctor -> registration`, `lab -> licence`, `ambulance -> licence`, `caretaker -> background_check`. |
| `public.add_staff_credential_document` (same signature, latest body M15 L31-56) | Writes `required_staff_kind(category)` instead of `required_kind(category)`. Grants re-asserted. |
| `providers_private.staff_evidence_ready(subject_case uuid, verified_only boolean)` | Compares `d.kind` with `required_staff_kind(p.category)`. Provider-level evidence keeps `required_kind` (ambulance providers still submit `vehicle_permit`). |
| `booking_private.resource_eligible` | Person branch requires `providers_private.person_is_verified(p.id, r.person_profile_id)` for every category (drops the `p.category <> 'doctor'` shortcut). Vehicle branch unchanged. |
| `identity_private.is_assigned` | Built body with two changes: `p_purpose = booking_private.person_purpose(b.category)` replaces the category/purpose OR list, and `providers_private.person_is_verified(b.provider_id, auth.uid())` applies to every category. |

This is the R P5-05 fix: the document writer, the readiness predicate and every consumer change together, and no fixture may seed a licence row directly to pass (suite `024` uses the public create, upload, submit and review path).

### 8.3 Generic projection (file `001580`)

`public.get_booking(p_booking_id uuid) returns jsonb` (same signature; grant `authenticated`). Viewer is resolved in this order; the first match wins:

| Viewer | Predicate | Keys returned (exactly) |
|---|---|---|
| Patient | `booking_private.patient(patient_id,'booking:read')` | `id, public_ref, provider_reference, category, service_id, pin_code, start_at, end_at, state, version, amount_paise, currency, terms_version, policy_version_id, patient_id, address_snapshot, contact_snapshot` |
| Scheduler | `booking_private.scheduler(provider_id)` | `id, public_ref, provider_reference, category, service_id, pin_code, start_at, end_at, state, version, amount_paise, currency, terms_version, policy_version_id` |
| Assignee | `identity_private.is_assigned(id, person_purpose(category))` or `booking_private.closeout_assignee(id)` | `id, public_ref, provider_reference, category, pin_code, start_at, end_at, state, version` |
| Anyone else | | `P0002 not_found` |

Doctor bookings add `substate` for every viewer, as built. An individual owner who is both scheduler and assignee gets the scheduler set and reads contact through `get_assignment_contact`. `list_bookings` and `get_provider_queue` keep their signatures and call `get_booking`, so they inherit the key sets.

Rule for category projections (L `get_lab_order`, A `get_trip`/`list_driver_trips`, D `list_my_doctor_visits`, C `get_care_plan`): rows returned to an assignee must be gated by `is_assigned` or `closeout_assignee`, never by assignment existence alone (R P5-13), and must not include address line, locality, contact, `patient_id`, amounts or currency.

### 8.4 Contact RPC (file `001580`)

| Function | Contract |
|---|---|
| `booking_private.contact_allowed(p_booking_id uuid) returns text` | `'assignee'` when `identity_private.is_assigned(id, person_purpose(category))` (state `confirmed`/`in_progress`, active assignment, window, membership, verification, publishable provider). `'ops'` when OD-3 is yes, `ops_actor(id)`, and the booking has an open exception or is escalatable (§6.4). Else null. Not granted. |
| `public.get_assignment_contact(p_booking_id uuid) returns jsonb` | Volatile definer; `require_actor()`; `contact_allowed` null raises `P0002 not_found` (same as a missing booking). Returns exactly `{booking_id, public_ref, address: {line1, locality, pin_code}, contact: {name, phone}}` from the booking snapshots. Writes `audit_events(actor, 'booking.contact_viewed' or 'booking.contact_viewed_ops', 'booking', booking_id)`, ids only. Grant `authenticated`. Routes call it with POST because PostgREST runs GET RPCs read-only. |

Rules:
- Any function that returns `address_snapshot` line or locality, or `contact_snapshot`, to a non-patient is `get_assignment_contact`. Category address-like data that is not in the booking snapshot (A's `destination_snapshot`) may be returned only by a category function that checks `contact_allowed(...) is not null` and writes the same audit action.
- Ending the assignment ends contact. Every category's absence report must end the person assignment (D does; L releases; A must add it; care has no absence step).
- Lists never return contact, so list refreshes write no audit rows.

### 8.5 Base-table access (file `001580`)

- `revoke select on public.bookings, public.booking_events, public.booking_assignments, public.resource_reservations, public.doctor_visits from authenticated;`
- `drop policy b01_bookings_patient on public.bookings; drop policy b01_events_patient on public.booking_events; drop policy b01_assignment_self on public.booking_assignments; drop policy b01_visits_patient on public.doctor_visits;`
- `revoke execute on function booking_private.patient_booking(uuid), booking_private.assigned(uuid,text) from authenticated;` (no policy uses them after the drops). `patient` and `scheduler` keep their grants because address, rule and exception policies still call them.
- `patient_addresses`, `resources`, `availability_rules` and `availability_exceptions` keep their built grants and policies.
- Patient timelines come from category projections (`get_doctor_visit`, `get_lab_order`, `get_trip`, `get_care_plan`), each returning `{reason, occurred_at}` without actor ids.

No file under `src/` reads these tables directly (checked with a search on `e7165fd`).

### 8.6 Tests (suite `024`)

Per category: scheduler, assignee, assignee after membership revoke, assignee with expired Q06 case, assignee before `start_at - 60 min` and after `end_at + 12 h`, assignee after the booking closes, other-provider member, and ops with and without an open exception. Assert: `get_booking` key set equals §8.3 exactly (`jsonb_object_keys`); `get_assignment_contact` allowed or `P0002`, with exactly one audit row per allowed call and none per denial; `has_table_privilege('authenticated', t, 'select')` false for the five tables; patient `select ... from public.booking_events` is `42501`. A lab technician's `get_booking` has no `amount_paise`, `currency`, `service_id`, `terms_version` or `policy_version_id`.

## 9. P5-08: event-reason storage (file `001550`)

### 9.1 Decision

Reasons are rows. The inline CHECK on `booking_events.reason` is replaced by a foreign key to `booking_private.reason_codes(code)`, and a BEFORE INSERT trigger on `booking_events` requires the `(booking category, reason)` pair to exist in `booking_private.category_reasons`. The same relation carries `blocks_cancel`, which replaces A's separate `cancel_blocking_reasons` table and L's `lab_cancel_guard` purpose. Category migrations add codes and pairs with `insert ... on conflict do nothing`. Codes are never updated or deleted.

Names: `booking_private.reason_codes` (L's name) and `booking_private.category_reasons`. A's `booking_private.event_reasons` and D's CHECK extension are not used.

Reasoning: four authors rebuilding one CHECK is the P01 H1 failure. A table seeded once with the built 12 codes cannot lose them. The per-category pair check catches a lab command writing an ambulance code, and gives the integration test a single table to compare against.

### 9.2 Shape

- `alter table public.booking_events drop constraint booking_events_reason_check;` (look the name up in `pg_constraint` if it differs) then `alter table public.booking_events add constraint booking_events_reason_fk foreign key (reason) references booking_private.reason_codes(code);`
- `booking_private.event_reason_guard()` trigger, `before insert on public.booking_events for each row`: raise `22023 invalid_reason` unless `exists (select 1 from booking_private.category_reasons cr join public.bookings b on b.id = new.booking_id where cr.category = b.category and cr.code = new.reason)`.
- Audit actions keep the built rule `'booking.' || reason`.

### 9.3 Shared seed

`reason_codes` from the shared block: the built 12 (`requested, accepted, confirmed, patient_request, provider_unavailable, unable_to_service, other, en_route, arrived, service_started, service_completed, reassigned`), cross-category codes (`absence_reported, unsafe_conditions, ended_for_emergency`), ops codes (`no_show_confirmed, absence_disputed, ops_closeout, provider_did_not_attend`). `reassigned` stays a code with no category pair until reassignment exists.

### 9.4 Complete category/reason mapping

"Seeded by" says which block inserts the `category_reasons` row. "Cancel" is `blocks_cancel`.

| Code | doctor | lab | ambulance | caretaker | Cancel | Seeded by |
|---|---|---|---|---|---|---|
| `requested`, `accepted`, `confirmed` | yes | yes | yes | yes | no | shared |
| `patient_request`, `provider_unavailable`, `unable_to_service`, `other` | yes | yes | yes | yes | no | shared |
| `ops_closeout`, `provider_did_not_attend`, `unsafe_conditions` | yes | yes | yes | yes | no | shared |
| `no_show_confirmed`, `absence_disputed` | yes | yes | yes | no | no | shared |
| `en_route`, `arrived` | yes | | yes | | yes | shared (doctor and ambulance pairs) |
| `service_started` | yes | | | yes | yes | shared |
| `service_completed` | yes | | | yes | no | shared |
| `absence_reported` | yes | yes | yes | | yes | shared |
| `ended_for_emergency` | yes | | yes | yes | no | shared |
| `address_not_found`, `declined_at_door`, `doctor_unable`, `patient_requested_stop` | yes | | | | no | doctor |
| `collection_started` | | yes | | | yes | lab |
| `sample_collected`, `sample_handed_over`, `collection_failed`, `handoff_failed` | | yes | | | no | lab |
| `picked_up` | | | yes | | yes | ambulance |
| `destination_reached`, `eligibility_blocked`, `vehicle_breakdown`, `requirement_mismatch`, `driver_unable` | | | yes | | no | ambulance |

Changes to the designs this mapping makes:
- Doctor: `ops_interrupted` becomes `absence_disputed`; `visit_not_recorded` becomes `ops_closeout`. Both are written by the shared ops command.
- Care: `ended_for_emergency` uses its own code instead of `unable_to_service`. C's other mappings (`patient_request_end -> patient_request`, `caregiver_unwell -> provider_unavailable`, `unsafe_environment -> unable_to_service`) stay; the precise reason stays in `care_plans`.
- `unsafe_conditions` is one code used by assignees (doctor, ambulance) and by ops (all categories). The event's actor, not the code, distinguishes them.
- `blocks_cancel` on a code that moves the booking to `in_progress` (`service_started`, `collection_started`, `picked_up`) is redundant with the state check and is set anyway, so the table reads as the full cancellation rule.

### 9.5 Tests

Suite `025` (shared): FK and pair trigger reject an unknown code and a known code for the wrong category; the 12 built codes exist; UPDATE and DELETE on both tables raise; `cancel_booking` rejects after an `en_route` event on doctor and ambulance and accepts after `eligibility_blocked`. Suite `090` (integration coordinator, after all blocks merge): every code each category's commands can write, as listed in §9.4, has its pair, and `select count(*) from booking_private.category_reasons` equals the table above.

## 10. P5-04: environment flag and database gate semantics (files `001550`, `001590`)

### 10.1 Decision

The database gate is the authority for every phase. The environment flag is an optional second key on **category-owned admission routes only**. Neither layer ever blocks closeout, reads, cancel, decline or ops.

| Phase | Commands | Gate `on` | Gate `off` | Gate `suspended` | Env flag off (category route) |
|---|---|---|---|---|---|
| admission | generic and category slots, create, accept; category public catalog reads that feed booking (L `get_lab_test_public`, C `get_care_service_tasks.bookable`) | allowed | `55000 feature_unavailable`; slots and catalog reads empty | same as off | 503 `feature_unavailable`, no RPC call |
| start | first assignee milestones: doctor `en_route`, `arrived`, `service_started`; lab `start_collection`; ambulance `en_route`, `arrived`, `picked_up`; care `started` | allowed | allowed for already accepted bookings | `55000 feature_suspended` | not checked |
| closeout | completion, interruption, absence, lab `collected`/handoff/failures, `eligibility_blocked`, cancel, decline, lab follow-up, care attestation, all ops RPCs | allowed | allowed | allowed | not checked |
| read | all projections and `get_assignment_contact` | allowed | allowed | allowed | not checked |
| provider configuration | `set_lab_test`, `set_care_service_tasks`, vehicle and driver registration | allowed | allowed | allowed | not checked |

Rules:
- Generic routes (`POST /api/bookings`, `POST /api/bookings/:id/accept`, `GET /api/availability`) have no env flag, because the category is unknown until the database reads the service. Doctor and caretaker admission are gated by the database only. Doctor gets no env flag.
- Category env flags: `FEATURE_LAB` (lab), `FEATURE_SCHEDULED_TRANSPORT` (ambulance). Care has no category admission route, so no flag. Each is added to `src/lib/feature-flags/index.ts` and `.env.example` by its category ticket, default off, `"true"` only.
- The route maps `55000 feature_unavailable` and `55000 feature_suspended` to 503 with the same body as env-off.
- To halt starts, set the gate to `suspended`. Provider or credential suspension is not the halt mechanism, because closeout must stay reachable (R P5-19).

This overrides L §4 (all lab routes 503 when off), A §8 (404 when off), C §4.1 (`care_private.gate` boolean, which is not created) and D §8.4.

Reasoning: the review found lab's flag cutting off the closeout its own matrix promised, and ambulance's route rule contradicting its database rule. Putting every phase decision in one database function makes the two layers agree by construction, and restricting the env flag to admission means a missing or wrong deployment variable can only stop new business.

### 10.2 Shape

| Function | Contract |
|---|---|
| `booking_private.gate_state(p_key text) returns text`, stable definer | `coalesce((select state from booking_private.feature_gates where key = p_key), 'off')`. |
| `booking_private.require_gate(p_key text, p_phase text) returns void`, volatile definer | `admission`: raise `55000 feature_unavailable` unless state is `on`. `start`: raise `55000 feature_suspended` if `suspended`. `closeout`, `read`, `config`: no check. Any other phase: `22023 invalid_input`. |

Both revoked from all API roles; no grants. Commands call `require_gate` after replay and before locks, then again after locks for `admission` and `start` (a gate change that commits while the command waits on a lock is seen).

**OWNER-DECISION OD-5:** seed value of the doctor gate (D DQ-01). Default: all four gates `off`, including doctor. Production then cannot book a real verified doctor until the owner turns the gate on. Built suites switch gates on in the fixture (§7.5).

**OWNER-DECISION OD-6:** how a gate changes. Default: no RPC. A reviewed migration or a recorded owner SQL step updates `feature_gates`; the trigger writes `feature_gate_events`; the change is logged in `docs/DECISIONS.md` and `docs/SESSION_LOG.md`, per the approval matrix row "Scheduled doctor/lab/ambulance/care bookings". An AAL2 admin command is a later addition if the owner wants in-app control.

### 10.3 Route tests (Vitest, per category ticket)

With `FEATURE_LAB` or `FEATURE_SCHEDULED_TRANSPORT` unset: admission routes return 503 and the `rpc` mock is not called; every start, closeout, read, cancel, decline and ops route still calls its RPC. `isEnabled` is true only for the exact string `"true"`.

### 10.4 Database tests (suite `023`)

For each category and each gate state, through direct RPC calls: admission rejected unless `on`; start allowed under `on` and `off`, rejected under `suspended`; closeout and reads allowed under all three; a gate change writes one `feature_gate_events` row; `feature_gates` has no privilege for `anon`, `authenticated` or `service_role`.

## 11. P5-02: shared resource-busy predicate (file `001570`)

### 11.1 Decision

A person or vehicle resource is **busy** while it has unresolved work in any category for any provider. Busy is checked by a BEFORE INSERT trigger on `resource_reservations`, so every acceptance path in every category is covered whether or not its author remembers to call it. Slot functions call the same predicate to stay accurate, but the trigger is the authority.

Definition. `booking_private.resource_busy(p_resource_id uuid, p_exclude_booking uuid default null) returns boolean` is true when either:
1. an `active` `booking_assignments` row for the resource belongs to a booking other than `p_exclude_booking` whose state is `confirmed` or `in_progress`, and `clock_timestamp() >= upper(occupied_period)` of that assignment's reservation (the work overran its reserved time and nobody closed it); or
2. an open `booking_exceptions` row whose kind has `blocks_resources = true` belongs to a booking that has an assignment (any status) of this resource.

`booking_private.booking_overdue(p_booking_id uuid) returns boolean` is condition 1 for one booking: state `confirmed` or `in_progress` and `clock_timestamp() >=` the largest `upper(occupied_period)` of its reservations, or `end_at` if it has none. Ops and category queues use it.

Reasoning:
- Every flow already ends the person assignment when work finishes (doctor and ambulance through `end_assignments`, lab and care through `release`, cancellation through `release`, ops through `end_assignments`). So "assignment still active after its reservation ended" means the same thing in all four categories: doctor overdue visit (D §9), lab custody past the after-buffer (L E14), ambulance overrun or not-started trip (A §5.5), care session never ended (C E9). One generic rule replaces three category predicates and adds the missing care one.
- A's blocking exception (`interrupted_after_pickup`) is the only case where work stays unresolved after the assignment ended. `blocks_resources` covers it without ambulance-specific SQL.
- A trigger is the only placement that a fifth accept command, or a category accept written later, cannot skip (R P5-02).

### 11.2 Reservation guard

`booking_private.reservation_guard()` trigger on `public.resource_reservations`, `before insert or update or delete for each row`, plus `before truncate for each statement` using `booking_private.immutable()`:
- INSERT: `perform 1 from public.resources where id = new.resource_id for update` (a no-op when the command already holds it), then raise `55000 resource_busy` if `resource_busy(new.resource_id, (select booking_id from public.booking_assignments where id = new.assignment_id))`. Also raise `55000 invalid_reservation` unless `new.status = 'active'`.
- UPDATE: only `status` may change, and only `active -> released`. Anything else raises `55000 immutable_reservation`. This stops a released reservation being reactivated without passing the INSERT check.
- DELETE: raise `55000 immutable_reservation`.

Error choice: `55000` (state, not retryable), message `resource_busy`. This replaces A's `40001 resource_busy` and L's `technician_custody_open`. It reveals only that the resource cannot be booked now, which the exclusion constraint's `23P01` already reveals for overlaps.

### 11.3 Edits for kept reservations (R P5-15, D B-8, A E-8)

- `public.upsert_booking_resource` (same signature): disabling raises `40001 resource_in_use` when an `active` reservation has `upper(occupied_period) > clock_timestamp()` or `resource_busy(r.id)` holds. Past kept reservations no longer block.
- `public.set_booking_availability` (same signature): the rule-edit branch raises `resource_in_use` only for an `active` reservation with `upper(occupied_period) > clock_timestamp()`.
- `public.add_booking_blackout`: unchanged (it already tests overlap with the blackout period).

### 11.4 Lock order (all P5 commands)

Booking row `for update`, then `booking_private.lock_provider` (organisation, then provider), then resource rows `order by id for update`, then category rows, then `booking_exceptions` rows, then the capability row `for share` for ops. A command that opens a `blocks_resources` exception holds the resource locks first, so it serialises with any accept of the same resource.

### 11.5 Tests (suite `021`, plus `run_p5s_concurrency.py`)

Cross-category, after reservation expiry, not only overlap (R P5-02 fix): one person resource that is a lab technician and an ambulance driver (or doctor). (1) Lab booking `collected`, clock moved past `upper(occupied_period)`: ambulance accept with that person raises `55000 resource_busy`; `list_transport_slots` and generic `list_slots` exclude the person. (2) The reverse with an overrunning trip and a lab accept. (3) Care `in_progress` past its upper bound blocks a doctor accept. (4) Open `interrupted_after_pickup` blocks the vehicle and driver after their assignments ended; resolving it unblocks. (5) After normal completion in each category the resource is not busy. (6) Direct owner-context `update resource_reservations set status = 'active'` on a released row raises. (7) Concurrency: an exception opening on booking X races an accept of booking Y for the same resource; exactly one order is observed and no accepted booking exists on a resource that was busy before the accept's resource lock.

## 12. P5-15: reservation release (file `001570`)

### 12.1 Decision

There are two named lifecycle operations, and every termination path selects one explicitly:

| Operation | Effect |
|---|---|
| `booking_private.release(p_booking_id uuid)` (built, unchanged) | Reservations `released`, assignments `ended`. The buffered time is freed. |
| `booking_private.end_assignments(p_booking_id uuid) returns void` (new) | Assignments `ended`, `ended_at = clock_timestamp()`. Reservations stay `active` until their upper bound passes, so the exclusion keeps the after-buffer. |
| `booking_private.finish_assignments(p_booking_id uuid) returns void` (new) | Reads `category_paths.assignee_close` and calls one of the two. Used by `assignee_finish` (§5.2) and by category terminal steps that do not go through `assignee_finish`. |

Selection table:

| Termination | doctor | lab | ambulance | caretaker |
|---|---|---|---|---|
| Cancellation (any caller, any time it is allowed) | release | release | release | release |
| Assignee completion or interruption | end_assignments | release | end_assignments | release |
| Assignee absence report (booking stays `confirmed`) | end_assignments | release | end_assignments | n/a |
| Lab failure steps | n/a | release | n/a | n/a |
| Ops close (§6.4) | end_assignments | end_assignments | end_assignments | end_assignments |

Reasoning: D and A keep the buffer because travel after a visit or trip is real and the next booking must not overlap it. L releases at handoff because the technician is already at the lab and the after-buffer is spent (L D5). C releases because an early end frees the caregiver (C E11). Both are defensible category policies. Writing the choice into `category_paths` makes it explicit and testable, and §11.3 removes the reason L gave for avoiding kept reservations (frozen availability edits). Ops always keeps reservations because it closes work whose real end time is unknown.

**OWNER-DECISION OD-7:** is early release for lab and care acceptable under the snapshotted booking terms (`terms_version`, policy buffer), or should every category keep the buffer? Default: the table above. Changing a category is one `category_paths` update in a shared fix file.

Grants: all three revoked from API roles; no grants.

### 12.2 Tests (suite `027`)

Per category: early completion and interruption leave reservations `released` or `active` per the table; a second booking overlapping a kept after-buffer is rejected at accept with `23P01`; availability edit is `resource_in_use` during the retained period and allowed once every relevant upper bound is past (split per R P5-18; shift booking, assignment and reservation times together and keep `ended_at >= started_at`); ops close keeps reservations for all four.

## 13. P5-09: replay rules (file `001550`)

### 13.1 Decision

Every new or replaced P5 mutating RPC takes `p_request_key uuid` and uses keyed replay through `public.idempotency_requests`. Replay runs after actor authentication and input-shape checks, and **before** live authorization, gates, caps and locks. A replay returns the recorded result only when the stored row matches the same actor, action and argument hash. Version-based replay (D §7.0) is not used.

Order inside every P5 mutating RPC:
1. `actor := identity_private.require_actor()` (active, non-anonymous account).
2. Null and shape checks on inputs (`22023`).
3. `hash := booking_private.request_hash(jsonb_build_array(<every business argument, including p_expected_version>))`.
4. Replay lookup for `(actor, action, p_request_key)`. Found with the same hash: return `result_version` (or `result_id` for creates). Found with a different hash: `40001 idempotency_conflict`.
5. Live authorization (`42501`/`P0002`), then gate (§10), then locks (§11.4).
6. Replay lookup again (a concurrent first call may have committed while this one waited on a lock).
7. Recheck authorization and gate; version check (`40001 stale_version`); state and substate checks; mutation.
8. `booking_private.record_request(actor, action, p_request_key, hash, result_id, result_version)` in the same transaction.

Reasoning:
- Assignment-ending steps (completion, interruption, absence, lab handoff) remove the live authorization the retry would need. Only a replay that precedes live authorization lets a lost response be retried (R P5-09).
- Binding to the stored actor, action and full argument hash means a replay can only return the result of the same command by the same person. The value returned is a version number of an operation that person already performed, so returning it after their access ends exposes nothing new.
- D's version-based replay bound actor and reason but not a request identity, and would need a second, different rule. One mechanism is simpler to test.

### 13.2 Shape

| Function | Contract |
|---|---|
| `booking_private.request_hash(p_args jsonb) returns text`, immutable | `encode(sha256(convert_to(p_args::text, 'UTF8')), 'hex')`, the built create hash method. |
| `booking_private.replay(p_actor uuid, p_action text, p_request_key uuid, p_hash text, out result_id uuid, out result_version integer)`, volatile definer | Selects the row; raises `40001 idempotency_conflict` on a hash mismatch; returns nulls when absent. |
| `booking_private.record_request(p_actor uuid, p_action text, p_request_key uuid, p_hash text, p_result_id uuid, p_result_version integer) returns void` | Inserts the row. |

Both revoked from API roles; no grants. `result_id` is the last `booking_events.id` written by the command, or the target row id (exception, booking) when no event is written. `result_version` is the version the command returned.

Action names: `p5.<category>.<command>` for category commands (for example `p5.lab.advance`, `p5.ambulance.advance`, `p5.doctor.advance`, `p5.care.attest`), `p5.ops.close`, `p5.ops.resolve`. Creates keep their built-style names (`booking.create`, `lab.create`, `transport.create`).

Scope:
- Creates are the one exception to step order. `create_request_core` keeps the built internal order (patient authorization, patient-row lock, recheck, then replay), because no create step ends the caller's authority. The public and category create wrappers run their own replay lookup first, so a replay still precedes the gate and the caps (M1 rule).
- Built `accept_booking`, `cancel_booking` and `decline_booking` keep their signatures and stay unkeyed. A retry after success gets `stale_version`, the client refetches, and the state shows the result.
- The doctor block replaces `public.advance_visit(uuid, text, integer)` with `public.advance_visit(p_booking_id uuid, p_substate text, p_expected_version integer, p_request_key uuid) returns integer` (drop the three-argument function in the same file, re-grant) and updates the four built routes to send `Idempotency-Key`. C's commands (`advance_care`, `interrupt_care`, `attest_care`, `set_care_service_tasks`) and A's `accept_transport` gain `p_request_key` the same way.

### 13.3 Tests (suite `026` and each category suite)

After every assignment-ending command in each category: same key and arguments returns the original version and writes no event; same key with a changed argument is `40001`; same key by another actor is an ordinary new call (keys are per actor) and fails authorization. Retry after a later step returns the original version. Retry after the caller's membership is revoked, the Q06 case expires, or the gate is suspended still returns the original version. Concurrency: two calls with one key race; exactly one event exists afterwards.

## 14. Owner decisions

| ID | Question | Default in this contract | Section |
|---|---|---|---|
| OD-1 | May a lab scheduler (not the reporter) confirm `no_show`? | No. Ops only, for doctor, lab and ambulance; caretaker has no `no_show`. | §4.1 |
| OD-2 | Who holds `booking:incident`, and in which hours? | Nobody. No gate `on` outside synthetic staging until named. No 24/7 promise. | §6.2 |
| OD-3 | May ops read contact while handling an exception? | Yes, only with an open exception or an escalatable booking, audited separately. | §8.1 |
| OD-4 | May provider schedulers see exact address and phone? | No. Assignee only. | §8.1 |
| OD-5 | Seed value of the doctor gate. | `off`, like the other three. | §10.2 |
| OD-6 | How a gate is changed. | Reviewed migration or recorded owner SQL; audited by trigger; no RPC. | §10.2 |
| OD-7 | Early release for lab and care under snapshotted terms. | Lab and care release; doctor and ambulance keep the buffer. | §12.1 |
| OD-8 | When may ops close without an open exception? | After `end_at + 12 h`, or while `in_progress` with an assignee who can no longer close out. | §6.4 |
| OD-9 | May an assignee see the booking amount? | No. P01 adds a separate collector projection. | §8.1 |

## 15. Changes each design must make

| Design | Change |
|---|---|
| Doctor | Drop B-4, B-7, B-9, B-15 as separate requests (shared now). Replace `doctor_visit_exceptions` and the three ops RPCs with §6. Use `assignee_finish` and `finish_assignments`. Keyed `advance_visit` (§13.2). Reason renames (§9.4). Suites `030` to `039`. |
| Lab | Use `create_request_core`, not the public create. Drop `lab_confirm_no_show` (ops path, OD-1). Absence, handoff and failures through `assignee_finish`/`finish_assignments` (release). Technician contact through `get_assignment_contact`. Env flag on admission routes only. Gate via `require_gate`, not `0A000`. `lab_cancel_guard` becomes optional (`blocks_cancel` covers it). Revoke functions from `service_role` too (R P5-20). Suites `040` to `049`. |
| Ambulance | Use `create_request_core`. Drop E-1 to E-9 and E-11 as requests (shared now), `trip_exceptions`, `resource_busy` and the four ops RPCs. Absence ends assignments. `get_trip_contact` becomes `get_assignment_contact` plus a destination read gated by `contact_allowed`. `resource_busy` errors are `55000`. Env flag on admission routes only. Suites `050` to `059`. |
| Caretaker | No `care_private.gate`; use `require_gate('caretaker', ...)` in the request trigger (admission), accept trigger (admission) and `advance_care('started')` (start). SH-1 becomes triggers plus the `category_paths` update; SH-2 and SH-3 are shared now. Ends and interruptions through `assignee_finish` (release). Stuck sessions close through closeout or ops. Keyed commands. `ended_for_emergency` code. Suites `060` to `069`. |

## 16. Limitations

- Written by reading the migrations on `e7165fd` and the four designs at their review commits. No SQL was written or run. Every signature, SQLSTATE and message is a contract for the shared migration author, not tested behaviour.
- Not reviewed by Claude, Codex or the owner. The owner decisions in §14 are defaults, not approvals.
- Findings outside the ten listed (P5-05 apart, which §8.2 includes) stay with the category designs or §2.5: P5-10 (patient approval binding to reviewed care scope and lab preparation), P5-11 (vehicle renewal), P5-13 (handled only as the §8.3 projection rule), P5-14, P5-16 to P5-23 except where §7.5 says the shared ticket edits a built suite.
- Ops close without an exception waits until `end_at + 12 h` (OD-8). A sample held by a technician whose membership was revoked can be closed earlier only because condition (c) applies to `in_progress` work.
- Kept reservations after early finishes (doctor, ambulance, all ops closes) reduce capacity. There is no trim command.
- §8.2 makes `resource_eligible` require Q06 verification for every person resource. Built commands that call it (`set_booking_availability`, `add_booking_blackout`, the update branch of `upsert_booking_resource`) then refuse an unverified staff member's resource, as they already do for doctors. A scheduler sets availability after the staff case is approved.
- Overdue and busy states are computed at read and insert time. Nobody is notified; the ops queue must be looked at.
- Until an ops holder exists (OD-2), all four flows are synthetic demonstrations: work an assignee cannot close stays open.
