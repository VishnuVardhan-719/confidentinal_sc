# B01 adversarial review (task/B01-booking, working tree)

Scope: uncommitted working tree in C:\Users\Yashwanth\SureCureVisit-codex-B01. `git diff task/C01-catalog..HEAD` shows nothing because B01 is not committed, so I reviewed the files directly:
- `supabase/migrations/202611170005_b01_booking.sql`
- `src/lib/booking/service.ts`, `src/lib/validation/booking.ts`
- `src/app/api/{bookings,availability,patient/addresses,provider/booking}/**`
- `tests/rls/b01_booking.sql`, `tests/rls/run_b01_concurrency.py`

Method: static read only. I changed no repo files and ran nothing for this review.
Caveat: I (Kiro) finished the implementation I am reviewing. A reviewer from a different agent would be more independent.

## Verdict
No cross-patient IDOR, price tampering or double-booking bypass found. The reservation exclusion and lock order hold up, and the two-connection races passed earlier. The blocking items are the missing time-window check in the assigned-actor predicate (H1), the cancellation deadlock (H2), and the lack of any accepted-booking exit path other than doctors.

## HIGH

**H1. The assigned-actor time check is a no-op, so the assigned doctor has access at any time and can finish a visit before it starts.**
- `identity_private.is_assigned` contains `a.period @> clock_timestamp() is not null`. That evaluates to `(bool) IS NOT NULL`, which is always true.
- Effect 1: the assigned person sees the patient's exact address and phone (`get_booking` details) from the moment of confirmation, possibly weeks early.
- Effect 2: `advance_visit` has no time guard. The doctor can run en_route, arrive, start and complete straight after acceptance. `complete` releases the reservation, which reopens the slot, and writes a `completed` booking. Any later P01 logic keyed on `completed` would be forgeable.
- Fix:
  - Enforce a window in `is_assigned`, for example `clock_timestamp() between lower(period)-interval 'X' and upper(period)+interval 'Y'`. X and Y need an owner decision.
  - Require `now() >= start_at - lead` for `service_started`.
  - Add a SQL test for the early-access case.

**H2. Nobody can cancel an accepted or confirmed booking until a policy is published.**
- `cancel_booking` raises 55000 `cancellation_policy_required` for both the patient and the provider when `cancel_window_minutes` is null. No policy rows exist.
- Effect: a doctor who cannot attend, or a patient who changes their mind, cannot cancel. The reservation stays active and the slot stays blocked.
- There is also no reassignment RPC (design brief section 5.7), and no `no_show` RPC even though `confirmed -> no_show` is in `booking_transitions`.
- Fix:
  - Allow provider-side cancellation (or an admin path) when no policy exists, with no fee.
  - Add `reassign_booking` and `mark_no_show`.
  - Otherwise state this as a release blocker.

**H3. Non-doctor categories cannot reach `in_progress` or `completed`.**
- `advance_visit` is hard-wired to `doctor_visit`, and `doctor_visits` rows are created only for `category='doctor'`.
- Lab, caretaker and ambulance bookings stay `confirmed` forever. Their reservations are never released except by cancel, and cancel is blocked (H2).
- Fix: either scope B01 explicitly to doctor and block `accept_booking` for other categories, or add visit handling per category.

## MEDIUM

**M1. Any member with `provider:read` can be assigned as the clinician.**
- `resource_eligible` checks only active membership and `provider:read`. It does not check qualification or role.
- For a doctor booking in an organization, an admin-staff member can be assigned. They then pass `is_assigned`, see the patient's address and phone, and can drive `advance_visit`.
- Fix: require a verified clinician credential, or a dedicated scope such as `visit:perform`.

**M2. Dependents are unsupported, contrary to the task rule "self/dependents they own".**
- `booking_private.patient()` requires `p.self_profile_id = auth.uid()` and `a.source='self'`.
- A guardian's grant on a dependent patient fails. Booking for dependents cannot work.
- Fix: model the guardian grant explicitly in `patient()` and add tests.

**M3. No abuse limits on create.**
- There is no rate limit or cap on pending requests per patient, per provider or per address, and no cap on `patient_addresses` rows. Address create has no idempotency key.
- A patient can flood a provider queue, and each create takes provider and org row locks (M4).
- `start_at` has no maximum horizon.
- Fix: a per-patient pending cap, a horizon limit, and rate limiting at the route (429 is mapped but never emitted).

**M4. `lock_provider` serialises all activity.**
- Every create, accept, decline, cancel, schedule edit and visit step takes `FOR UPDATE` on the provider row and the organization row.
- One organization's bookings are fully serialised, and a flood of creates blocks accepts for that organization.
- Fix: take `FOR SHARE` on organization and provider where only a read-consistent check is needed. Keep `FOR UPDATE` on the resources and the booking.

**M5. The `upsert_booking_resource` person branch leaks and conflates identities.**
- When `p_expected_version=0`, it returns the id of an existing global resource for that profile. That id can belong to another organization.
- Only the person themself can update their resource (`r.person_profile_id<>actor`), so an organization manager cannot disable a member's resource.
- Vehicle plates are globally unique. A provider can squat a plate, and the 23505 conflict (409) tells the caller the plate exists elsewhere.
- Fix: model resource-to-provider links explicitly. Return an opaque 409 without confirming the existing id.

**M6. `list_bookings` is unusable for non-scheduler assignees and pages badly.**
- An assigned doctor who is not a scheduler cannot list their bookings. They only get `get_booking` by id, so they cannot discover assignments.
- Pagination orders by random UUID (`order by b.id`), so it is not chronological.
- Each row calls `get_booking`, which re-runs the authorization functions per row.
- Fix: add a `list_my_assignments` function. Use a keyset on `(start_at,id)`.

## LOW

- **L1.** `public_ref` comes from a global sequence, so it is guessable and leaks platform booking volume to every booker. Lookups use the UUID, so there is no IDOR, but consider a non-sequential reference.
- **L2.** Patients can read `booking_events.actor_profile_id`. That is the provider or doctor's profile UUID.
- **L3.** Published policies are immutable and cannot be set to `disabled`, so a mistaken policy cannot be retired. Add a successor-version rule.
- **L4.** accept, decline, cancel and visit steps have no idempotency key. A retry after success returns 40001, which the service maps to 409, the same as an idempotency payload mismatch. The client cannot tell them apart. The HTTP error code could be split.
- **L5.** Two concurrent creates with the same key give 23505, which becomes 409. This is safe, and the client's retry replays.
- **L6.** Patients can make overlapping requests to different providers, with no patient-side overlap check. This is probably product-acceptable.
- **L7.** The price lookup in create (`select * into price ... for share`) assumes C01 prevents overlapping `effective_from/to` ranges. If it does not, the pick is arbitrary.
- **L8.** `booking_private.patient/scheduler` and similar functions are executable by `authenticated`. They use `auth.uid()` only, so this is not a leak, but confirm the schema is not exposed via PostgREST (`db.schemas`).

## Verified as sound (no finding)
- **Price integrity:**
  - There is no price parameter. The server snapshots price from `service_price_versions` and a trigger blocks the booking-insert snapshot if it does not match.
  - `accept_booking` rechecks the price version is current and equal.
  - Amounts are bigint, returned as strings.
  - Direct UPDATE is denied (no grant), and the trigger blocks trusted mutation.
- **IDOR:**
  - Foreign bookings give 0 rows under RLS and P0002 (404) from `get_booking`.
  - Accept, decline, cancel and visit calls return 42501 for both unknown and foreign ids, so there is no existence oracle.
  - `list_bookings` rechecks the provider scope.
- **Provider queue PII:** address and contact snapshots are omitted before confirmation and after completion. The queue projection shows PIN, service, time and `public_ref`.
- **Double booking:**
  - A GiST exclusion on active reservations per resource.
  - Lock order is booking, provider, resources by UUID.
  - A shared person resource covers cross-category and cross-organization cases.
  - Accept versus cancel and cancel versus cancel passed the two-connection races.
- **Versions and idempotency:** optimistic versions are checked after locking. Create replay is keyed `(actor, action, key)` with a payload hash, and authorization is checked before the replay.
- **Hardening:** all RPCs use `search_path=''`. There are no table write grants, and events are immutable. The route Zod schemas are strict objects with UTC-only instants, and there is no actor, status, price or paid field in any route.

## Test gaps (relevant to the above)
- No cases for:
  - organization scheduler authorization (wrong-org, disabled, invited members)
  - a cross-provider scheduler trying to decline or cancel
  - ambulance accept with a vehicle
  - an early-access doctor (H1)
  - reassignment or ex-assignee loss of access
  - suspended provider or revoked member versus accept
  - cancel after confirm
  - `booking_events` and `notification_outbox` RLS
  - idempotency replay after the grant is revoked
- `run_b01_concurrency.py` reports the `c01_catalog.sql` failure as "known" and continues, so a regression in that suite would also be hidden there.
- There are no HTTP-level route tests.
