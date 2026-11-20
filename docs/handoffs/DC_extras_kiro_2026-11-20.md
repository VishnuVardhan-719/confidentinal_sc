# DC extras handoff (DC03, DC10, DC11, DC12, DC13, DC14)

Task: DC extras. Agent: Kiro. Branch: `feat/DC-extras`, from `origin/integ/all` `bed2877`, merged with `origin/integ/all` `34947a2` before the final checks. Authority: `C:/tmp/scv_logs/dc_extras_task.md`. Design: `docs/specs/DC_extras_design.md`. The commit identity is the branch HEAD.

**DB NOT EXECUTED.** Every migration, pgTAP suite and race case is authored and desk-checked only. No Docker, `supabase` or database command was run. No dependency was installed, no `.env` was read, nothing was pushed to `main`, `develop` or `integ/all`. Synthetic data only.

## Built

| DC | What exists already | What this branch adds |
|---|---|---|
| DC03 | 20 s refetch of `get_doctor_visit` (doctor design §8.5), minimal outbox payloads, no Realtime publication | `get_visit_progress(booking, after_version)`: state, substate, version, terminal flag and `{version, reason, occurred_at}` events after a cursor, for the patient or the visit's doctor. `src/lib/doctor-extras/progress-poll.ts`: 20 s polling, 40 s/60 s backoff, refetch on focus/visibility/online, resume from the last version, stop at a terminal state. Realtime stays off. |
| DC10 | P01a: separate `payments` ledger; booking engine never reads it; only `direct_pay_after`; `paid_enabled=false` | `get_visit_payment_status(booking)`: visit block and payment block side by side for the patient or the visit's doctor; `gateway_paid` false for pay-after; no amounts, collector or reference; visit block returned when pay-after is off. Suite 121 proves completion commits while payment is `due` and a collection report changes no booking state, version or event. |
| DC11 | nothing | `health_facts` (head), `health_fact_versions` (immutable, `patient_reported`), `health_fact_verifications` (immutable, exact version FK, reviewer = caller, coded evidence kind + identifier ref). Keyed `record_health_fact`, `revise_health_fact`, `verify_health_fact`; `list_health_facts` (doctor reads audited). Only a started visit's DC01 doctor with a current Q06 credential verifies. |
| DC12 | nothing | `dcx_private.visit_proof_tokens` (sha256 only). Keyed `issue_visit_proof` (patient, completed visit, 1-720 h, 3 live per booking), `revoke_visit_proof` (never gated, idempotent), `list_visit_proofs`, guest `verify_visit_proof` returning only `{valid, visit_date, service}` or `{valid:false}`. QR encodes `https://surecurevisit.in/proof#<token>` (fragment, never logged). |
| DC13 | shared Storage registry `001591` | `visit_photo_consents`, `visit_photos`, `dcx_private.photo_read_tickets`, private bucket `visit-evidence` (5 MiB, JPEG/PNG). Keyed `grant_photo_consent`, `withdraw_photo_consent` (never gated; reads stop at once, `delete_after` set), `register_visit_photo` (started visit's verified doctor, granted consent of this booking, 10 per booking); `authorize_visit_photo_read` (60 s ticket, audited), `list_visit_photos`. Predicate `dcx_private.photo_object_access` registered in `providers_private.category_object_checks`, two permissive policies, like ambulance `001810`. |
| DC14 | clinical-core interface pushed (`origin/feat/DC-clinical-core` `5c0b8b2`, design §1) | `src/lib/pdf/writer.ts` (PDF 1.4, Helvetica/WinAnsi, wrapping, pagination, byte-exact xref, deterministic) and `src/lib/doctor-extras/visit-report.ts` (typed record document, IST without locale data, SHA-256). Migration `002450`: `get_clinical_report_source` (bound to `clinical_private.record_reader` and `record_document`, audited) and keyed `record_clinical_report` (append-only render log). Route `POST /api/clinical-records/:id/report` streams the PDF with `private, no-store`. No bucket and no stored file. |

Gates in `booking_private.feature_gates`, all seeded `off`: `doctor_progress`, `doctor_visit_payment`, `doctor_fact_review`, `doctor_visit_proof`, `doctor_photos`, `doctor_reports`. Writes need `on`; reads allow `on` or `suspended`; revocation and consent withdrawal are never gated. The photo Storage predicate checks the gate too.

## Files

- Design: `docs/specs/DC_extras_design.md`.
- Migrations: `supabase/migrations/20261117002400_dcx_foundation.sql`, `002410_dcx_progress_payment.sql`, `002420_dcx_fact_review.sql`, `002430_dcx_visit_proof.sql`, `002440_dcx_photo_consent.sql`, `002450_dcx_reports.sql`.
- SQL suites: `supabase/tests/_dcx_fixture.inc`, `120_dcx_structure`, `121_dcx_progress_payment`, `122_dcx_fact_review`, `123_dcx_visit_proof`, `124_dcx_photo_consent`, `125_dcx_reports`.
- Race runner: `tests/rls/run_dc_extras_concurrency.py` (R1 proof cap, R2 withdrawal vs registration in both orders, R3 revision vs review, R4 one review key twice).
- App: `src/lib/doctor-extras/{service,progress-poll,visit-report}.ts`, `src/lib/pdf/writer.ts`, `src/lib/validation/doctor-extras.ts`.
- Routes: `src/app/api/bookings/[id]/{progress,visit-payment,visit-proofs,photo-consents,photos}/route.ts`, `src/app/api/patients/[id]/health-facts/route.ts`, `src/app/api/health-facts/[id]/{revise,verify}/route.ts`, `src/app/api/visit-proofs/verify/route.ts`, `src/app/api/visit-proofs/[id]/revoke/route.ts`, `src/app/api/photo-consents/[id]/withdraw/route.ts`, `src/app/api/visit-photos/[id]/read-ticket/route.ts`, `src/app/api/clinical-records/[id]/report/route.ts`.
- Vitest: `tests/unit/doctor-extras.test.ts` (enum/CHECK parity, migration hygiene), `doctor-extras-http.test.ts`, `pdf.test.ts`, `progress-poll.test.ts`.

No file of another block was edited. `src/lib/booking/service.ts` is untouched; DC-extras has its own `dcxCommand` with the same status table (parity test). `docs/IMPLEMENTATION_TASKS.md` is untouched.

## Commands for the teammate (local Docker machine)

Merge `feat/DC-clinical-core` first (see conflict 1), then:

```
npx supabase db reset --local
npx supabase test db
python tests/rls/run_dc_extras_concurrency.py
```

Record the real output in `docs/TEST_EVIDENCE.md`. CI on `integ/all` now runs `supabase db reset` and `supabase test db`, so suites 120-125 will execute there after merge.

## Static checks (this branch after merging `origin/integ/all` `34947a2`, real output)

- `node node_modules/next/dist/bin/next typegen`: types generated.
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0.
- `node node_modules/eslint/bin/eslint.js .`: exit 0.
- `node node_modules/vitest/vitest.mjs run`: 33 files passed, 2 skipped; 687 tests passed, 2 skipped.
- `python -m py_compile tests/rls/run_dc_extras_concurrency.py`: ok.
- `next build` not run (coordinator builds after merge).
- An independent validation pass (read-only) checked SQL signatures against the shared, doctor and P01a migrations, the gate seeds, grants and fixture helpers: PASS. Its one gap (the Storage predicate ignored the gate) is fixed above.

## Conflicts and merge order

1. **`002450` requires `feat/DC-clinical-core`.** Its preflight raises unless `clinical_private.record_reader(uuid)`, `record_document(uuid)` and `clinical_private.clinical_records` exist. `origin/feat/DC-clinical-core` holds only its design at `5c0b8b2`. If DC-extras merges into `integ/all` before clinical-core's `0023xx` migrations, `supabase db reset` and CI stop at `002450`. Merge clinical-core first, or hold this branch.
2. The `integ/all` merge (`34947a2`) had no conflict. Shared `001591` changed its validator (`proargtypes` by index); the DC13 predicate signature `(text,text,boolean) -> boolean` satisfies both versions.
3. Suite `023_p5s_gates` on `integ/all` already filters to the four category gates, so the six new gate rows do not break it.

## Not built, and why

- DC13 object deletion after withdrawal: retention is D-PRIV and Storage deletion needs a reviewed service-side adapter. Reads stop at withdrawal and `delete_after` marks the due objects.
- DC14 signed-record happy path in SQL (patient and signer render, render log, amendment renders a new version): needs the clinical-core fixture (`_dc_fixture.inc`), not on this branch. Suite 125 covers structure, denials, gate and input checks; Vitest covers PDF bytes, xref, determinism and the amendment case.
- DC14 Indic scripts: the writer draws WinAnsi only (Hindi/Telugu become `?`). An embedded font is a separate task.
- DC03 Realtime broadcast: not added; refetch plus delta read per the doctor design.
- Clinician-recorded health facts and any link between DC11 facts and DC08 allergy checks: owner question 2.
- UI pages, copy in en/hi/te and Playwright journeys: UI is outside this ticket.
- Rate limiting of the guest proof check beyond the 256-bit token space: no limiter exists in the stack yet.

## Security notes

- No plaintext proof token is stored, logged, audited or put in a URL path. The guest check reveals only validity, a date and the service kind.
- Audit rows hold ids and an action only. No new command writes `booking_events`, `notification_outbox` or a notification.
- Every new table: RLS on, no policy, no privilege for `anon`, `authenticated` or `service_role`. Only `verify_visit_proof` is executable by `anon`. Only the Storage predicate in `dcx_private` is executable by `authenticated`.
- "Doctor verified" (DC11) requires a started visit, the DC01 assignee/closeout predicate on the visit's own assignment and a current Q06 credential; patients cannot create verifications.
- DC14 render log hashes come from the server route but the RPC is callable directly; rows are deduplicated and capped per caller and record, and the authoritative content stays the immutable record and its `content_sha256`, printed in the PDF.

## Owner questions

1. DC03: keep refetch only, or approve a private broadcast channel later?
2. DC11: should DC08 allergy checks read `health_facts`? Should clinicians record facts directly?
3. DC12: TTL default (7 days) and maximum (30 days); may a doctor issue a proof?
4. DC13: retention after withdrawal (default: due immediately), allowed purposes, 10-photo cap.
5. DC14: download for patient and signer only (default, from the clinical-core reader), and are Indic scripts required in the PDF?

## Push

`git push origin feat/DC-extras` was refused by this agent's tool permissions at design time, so the design and implementation commits are local to the worktree. The project owner or coordinator must push the branch.
