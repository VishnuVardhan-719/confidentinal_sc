# FE-C cross-review — identity and clinical

Date: 2026-11-18. Read-only review; no sibling source changes, commits or pushes. Reviewed against fe2-c docs/FRONTEND_MASTER.md sections 5, 8, 10–11 and docs/API_CONTRACTS.md (proposed, not implemented-endpoint evidence).

Scope correction: C:/Users/Yashwanth/fe2-b/src/modules/identity does not exist. Identity implementation is split across src/modules/auth, onboarding, organizations and verification. Focused review covered route/session guards, cookies, auth flows and transport, onboarding mutation guards/loaders/HTTP, organization invitations and administrative verification guards/HTTP. Clinical review covered gate/factory, schemas/DTOs, draft machine/controller/hook, conflict, signing recovery, loaders, PDF state and editor helpers. This is a boundary-focused review, not exhaustive verification of all sibling files.

## Findings

### P1 — Amendment recovery can attribute somebody else's content to this intent

Location: C:/Users/Yashwanth/fe2-d/src/modules/clinical/finalize-flow.ts:75 (predicate at lines 76–77).

After an unavailable amendment response, recovery accepts any amendment with matching baseVersion, reason and reasonText. Two clinicians/intents can use identical correction text while submitting different content. The predicate neither compares the signed version's content nor binds a server-reported mutation/idempotency identity; it searches historical amendments rather than establishing which current authoritative version corresponds to this intent. It can report signed success for an amendment this clinician never approved. FRONTEND_MASTER section 11/DC07 requires reviewed, server-confirmed, attributed immutable versions and uncertain-outcome recovery.

Fix: contract a server mutation/intent identifier and bind it to consultation/base/result version and submitted content (or authoritative content digest). Until proof is available, treat ambiguous readback as conflict/review; do not claim this amendment succeeded from reason metadata. Bind returned consultation IDs as well. A later unrelated amendment must not be presented as the current intent's success.

Regression: lose the response; return an authorized final record with identical base/reason/reasonText but different amended content. Expect conflict/review, not signed. Also cover a matching historical amendment followed by a different latest version. Existing loaders-and-flows.test.ts:175 covers different reasonText, which misses this collision. Isolated in-memory probe confirmed the different-content case currently returns signed.

### P2 — Reconnect restarts autosave after permission/validation/gate failure

Location: C:/Users/Yashwanth/fe2-d/src/modules/clinical/draft-machine.ts:168.

save_failed correctly disables autosave for forbidden, unauthenticated, validation and gated responses. connectivity_changed(true) unconditionally resets failures and enables autosave. A subsequent offline/online event therefore retries the same clinical write without explicit authorization recovery or input correction; even a redundant online event lifts the block. It also resets the exhausted transient retry budget. FRONTEND_MASTER section 11/DC05 requires bounded retries only with authorization.

Fix: preserve terminal failure/retry-exhausted state across connectivity changes. Restore scheduling only for eligible transient failures under the bounded budget; use an explicit reauthorization/correction/retry action to clear a terminal block. Do not erase the failure budget merely because connectivity changes.

Regression: forbidden/unauthenticated/gated/validation → offline → online (and duplicate online) must produce no save; verify exhausted unavailable retries remain bounded. Probe confirmed forbidden → reconnect changes shouldAutosave from false to true.

### P2 — Stale keep-local conflict decision bypasses reviewed edit sequence

Location: C:/Users/Yashwanth/fe2-d/src/modules/clinical/draft-machine.ts:190.

The take_server branch checks reviewedEditSeq, but keep_local ignores it. If the clinician views conflict at sequence N, edits again and submits an older reconciliation action, the reducer clears the conflict, rebases all newer text onto the server version and resumes autosave. That bypasses the reviewed reconciliation promised by conflict.ts and FRONTEND_MASTER section 11/DC05; unreviewed new text can overwrite the latest notes. The controller's updating diff does not make an already captured decision current.

Fix: require reviewedEditSeq === state.editSeq for both resolutions before clearing conflict; keep newer edits and request another explicit comparison. Validate the reviewed server snapshot/version identity when reconciling, too.

Regression: capture conflict review sequence, edit, apply keep_local with the old sequence; conflict must remain and no save should start. Probe confirmed the stale action currently clears conflict and enables autosave.

### P2 — Stored refresh token has no session-renewal flow

Location: C:/Users/Yashwanth/fe2-b/src/modules/auth/server.ts:63 (early anonymous return at line 67; access-only lookup at lines 68–69).

The app writes a seven-day refresh cookie and implements AuthApi.refresh, but getServerSession immediately returns anonymous when the short-lived access cookie is absent and never refreshes after an expired access token returns 401. A source search found no .refresh(...) call and no readRefreshToken use beyond hadSession. A still-valid refresh session therefore sends the user to login instead of supported session renewal. FRONTEND_MASTER section 8 explicitly requires refresh/session-expiry protection. This is an integration gap, not an authorization bypass; existing denial is fail-closed.

Fix: implement a bounded server-owned refresh path in a route handler/server action (cookie mutations cannot be bolted into arbitrary server-component reads). Read only the httpOnly refresh cookie, rotate both cookies on success, then re-fetch the session once; clear invalid/revoked sessions, preserve outage distinctions, deduplicate concurrent refreshes and avoid loops. Keep tokens out of client state and URLs.

Regression: absent/expired access + valid refresh resumes authorized route; invalid/revoked refresh clears session; refresh outage is handled distinctly; concurrent requests do not rotate repeatedly or grant stale membership. Static evidence verified; no live Supabase refresh test was run.

## Deliberate gates and limitations — not findings

- Phone OTP, missing patient draft/completion contracts, admin review queue/coverage operations, clinical draft GET/amendment/PDF-link issuance remain explicitly gated. Proposed endpoint/DTO differences alone are not implemented-backend defects.
- Role checks are advisory until bound to real page/server/DB guards. Organization, resource assignment, MFA, signed-file permissions and clinical enablement require backend evidence; this review does not certify those controls or deployment readiness.
- Clinical default-off gating, in-memory drafts, versioned serialized save model, finalized-only record views, server-attributed signer DTOs and separate clinical/payment states are consistent with the stated direction. No claim that all DC01–DC14 are implemented or verified.

## Evidence and handoff

Three clinical counterexamples reproduced from the exact sibling source via TypeScript transpileModule and isolated VM loading; only type-only-import modules were evaluated, using synthetic values. Script: C:/Users/Yashwanth/fe2-c/.context/xreview-probes.mjs. It asserts existing problematic behavior to substantiate findings; it is not a passing regression suite for the proposed fixes. No sibling files were written and no sibling tests/builds or backend/RLS/browser verification were run. Identity refresh finding is source-backed, not a live-session result. Current-worktree lint/typecheck/unit validation is reported separately after this document is written.

Requested fixes belong to fe2-b / fe2-d owners. Do not merge or enable clinical/payment features on the basis of this review. Route draft: C:/Users/Yashwanth/fe2-c/docs/frontend/ROUTES.md; missing pages are PENDING → FIXTURE, with INTEGRATED/VERIFIED promotion evidence defined explicitly.

Current fe2-c validation: lint exit 0 after converting the review probe to ESM; typecheck exit 0; Vitest 14 files / 175 tests passed. No sibling suite or production-readiness claim.
