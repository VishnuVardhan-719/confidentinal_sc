# DC clinical core (DC04-DC09) handoff

Task: `C:\tmp\scv_logs\dc_core_task.md`. Agent: Kiro. Branch `feat/DC-clinical-core`, created from `origin/integ/all` at `bed2877`, merged with `origin/integ/all` at `34947a2` before the final push. Design: `docs/specs/DC_clinical_core_design.md`; it was committed and pushed first, at `5c0b8b2`.

**DB NOT EXECUTED.** Both migrations, the five pgTAP suites, the fixture and the concurrency runner were written and desk-checked only. No Docker, `supabase` or database command was run. CI (`.github/workflows/ci.yml`) runs `supabase db reset` and `supabase test db` on pushes to `feat/**`, so the CI run for this push is the first real execution. I could not read it from here (no `gh`, private repository).

## What was built

| Row | What exists |
|---|---|
| DC04 vitals and examination | Typed vitals with explicit units (`temperature {value, unit C/F}`, BP pair, pulse, SpO2, respiratory rate, height, weight). Values outside the hard limits are rejected. Plausible but dangerous readings are stored as entered, produce warning codes, and must be acknowledged at signing. Examination fields: chief complaint, duration, findings. The draft lives in `clinical_private.consultations`, which only the assigned doctor can write. |
| DC05 draft and autosave recovery | Keyed `save_clinical_draft` with `p_expected_version` (0 creates the draft). `stale_version` reaches the client by name. Client controller `src/lib/clinical/autosave.ts`: 1.5 s debounce, `flush()`, states `idle/unsaved/saving/saved/error/conflict`, a retry reuses the idempotency key, a conflict loads the server copy and waits for `keepMine`/`takeServer`, `reconnect()`. Memory only. |
| DC06 assessment | Clinician-authored summary, certainty `provisional/final/undetermined`, optional diagnoses each with its own certainty and an optional ICD-style code, differentials, red flags, outcome. `undetermined` with no diagnosis can be signed; `final` needs at least one diagnosis. No AI field; signing requires `authoredConfirmed=true`. |
| DC07 finalized record | `sign_clinical_record` freezes the exact draft version into `clinical_private.clinical_records`, recording the signer, `signed_at`, `source_draft_version` and a trigger-computed `content_sha256`. Update, delete and truncate raise `55000 immutable_event`. `amend_clinical_record` writes a new version that supersedes the latest one (with reason, same signer, version+1). A unique `supersedes_record_id` stops the chain from forking. |
| DC08 structured prescription | Typed `prescription_items` rows (name, form, strength, dose, route, frequency, duration, quantity, instructions, override reason). A guard trigger requires each row to equal the frozen content line by line. Allergy check: a medicine name that matches a recorded allergy substance needs an override reason. Prescribing requires allergies to be assessed and `allergiesReviewed=true`. Audit rows `clinical.record_signed` and `clinical.prescription_signed` are written. |
| DC09 patient consultation view | `list_clinical_records` and `get_clinical_record` serve the linked self patient (`booking_private.patient(...,'booking:read')`) and the signer while still a member. Everyone else gets `P0002`. Every read is audited (`clinical.record_viewed`). Drafts are never visible to the patient. Reads ignore the gate. |

Rules applied throughout:
- **Gate:** `booking_private.feature_gates` row `doctor_clinical`, seeded `off`. Every write requires `on`.
- **Who writes:** writes use the DC01 predicate `doctor_private.assignee` while the visit is `service_started`. After the doctor's own completion, a post-visit window stays open until `end_at + 12 h`. It applies the same publishability, resource-eligibility and Q06 tests, minus the active-assignment test, because completion ends the assignment.
- **No clinical side effects:** no clinical command writes `booking_events`, `notification_outbox` or N01 sources. `audit_events` rows carry ids only.
- **No direct table access:** `clinical_private` is closed to `anon`, `authenticated` and `service_role`. RLS is on with no policy.

## Interface for DC-extras

As in design §1, with no change since `5c0b8b2`: `public.get_clinical_record(uuid) returns jsonb`, `public.list_clinical_records(uuid) returns jsonb`, plus the private helpers `clinical_private.record_reader(uuid)`, `clinical_private.record_document(uuid)` and `clinical_private.latest_record_id(uuid)`, and the table `clinical_private.clinical_records`. Suite 114 pins the document keys.

## Files

- `docs/specs/DC_clinical_core_design.md`
- `supabase/migrations/20261117002300_dc_clinical_model.sql`, `20261117002310_dc_clinical_commands.sql`
- `supabase/tests/_dc_fixture.inc`, `110_dc_structure`, `111_dc_draft`, `112_dc_sign`, `113_dc_amend`, `114_dc_patient_view` (`.test.sql`)
- `tests/rls/run_dc_core_concurrency.py`: cases D1 (two saves on one version), D2 (sign vs save), D3 (two amendments of one version), D4 (one sign key twice). It uses the reset pattern of `run_p5c_concurrency.py`, which drops every `*_private`/`*_worker` schema.
- `src/lib/clinical/rules.ts`, `service.ts`, `autosave.ts`; `src/lib/validation/clinical.ts`
- Routes: `src/app/api/bookings/[id]/consultation/draft/route.ts` (GET, PUT), `.../consultation/sign/route.ts` (POST), `.../consultation/records/route.ts` (GET), `src/app/api/clinical-records/[id]/route.ts` (GET), `src/app/api/clinical-records/[id]/amend/route.ts` (POST). Each handler calls `await connection()` first; none uses `export const dynamic`.
- `tests/unit/clinical.test.ts`: TS/SQL rules parity, validation, warnings, allergy match, static SQL checks. `clinical-http.test.ts`: routes, keys, error mapping, parity with `bookingCommand`. `clinical-autosave.test.ts`.

No file owned by another block was edited. `docs/IMPLEMENTATION_TASKS.md` was not touched; it differs from `bed2877` only through the `integ/all` merge.

## Commands for the teammate (Docker and the Supabase CLI required)

```
npx supabase start
npx supabase db reset --local
npx supabase test db
python tests/rls/run_dc_core_concurrency.py
```

Or, in one step, `npm run verify:db`. Run `python scripts/db_verify.py --only dc_core` for this runner only.

## Check results (this laptop, after the merge)

| Check | Result |
|---|---|
| `node node_modules/next/dist/bin/next typegen` | `Types generated successfully` |
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0, no output |
| `node node_modules/eslint/bin/eslint.js .` | exit 0, no output |
| `node node_modules/vitest/vitest.mjs run` | 32 files passed, 2 skipped (the existing DB-dependent ones); 112 of the tests are new clinical tests |
| `next build` | not run (task rule) |

An independent desk-check of the SQL found no blocking error in the two migrations. It did find two test-script bugs, both now fixed:
- four assertions in 111 and 114 closed `(select …)` before its `from`;
- one fixture read of `clinical_private` ran under `set local role authenticated`.

A quote-aware parenthesis check over every DC SQL file is clean.

## Conflicts

- The merge of `origin/integ/all` (8 commits through `34947a2`) had no conflicts.
- `023_p5s_gates` used to assert exactly four gate rows. `34947a2` scoped it to the four category gates, so the new `doctor_clinical` row no longer breaks it.
- `023` and the per-category suites flip every gate with `update booking_private.feature_gates set state='on'`. That now also turns `doctor_clinical` on inside those rollback-only suites, which is harmless.

## Not built, and why

- **UI pages:** none. The repository has no UI shell yet, and frontend work is handed over separately. The autosave controller and routes are what a page would use.
- **Clinical consent before drafting (DCQ-1):** no consent model exists. The gate stays off until the owner decides.
- **Notifications on signing (DCQ-7):** adding an N01 source is N01's file range.
- **PDF, photos, QR, health-fact history, payment view:** DC10-DC14 belong to `feat/DC-extras`.
- **Draft revision history:** the draft row keeps only the latest saved version; the replay rows record each save's hash.
- **Drug-class or interaction allergy checks (DCQ-6):** the check is a name match plus clinician attestation. For example, amoxicillin is not matched against a penicillin allergy; this is documented and tested.
- **Clinician handover for amendments (DCQ-4):** only the signer can amend, within 30 days.
- **Guardian or family access (DCQ-5):** self patient only.

## Security notes

- **Clinical content stays in `clinical_private`:** no RLS policy exists, and no API role holds a privilege, `service_role` included. All access goes through definer RPCs with an empty `search_path`, granted to `authenticated` only.
- **Hashes outside `clinical_private`:** `idempotency_requests.request_hash` holds a sha256 of the command arguments, which include the clinical content. It is a hash, not the content, but it is a derived value outside `clinical_private`.
- **Owner can bypass immutability:** guarantees hold for application roles. The table owner can disable triggers, as with every other block.

## Open owner questions

DCQ-1 to DCQ-8 are in design §10: consent, vital thresholds (needs clinical sign-off), the post-visit signing window, amendment window and handover, guardian access, allergy checking depth, notification on signing, and draft encryption at rest. All run on the stated safe defaults, with the gate off.
