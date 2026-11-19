# Handoff: PHASE4-E2 ops e2e (fe2-e, branch feat/fe2-e)

Base 57a103a. Commits: b77fb24 (app fixes + ops spec fixes), ea568c8 (role-isolation spec, caretaker dashboard axe, mobile locators), b49844c (fixture clock lazy start), plus the handoff commit.
Synthetic data only. Port 3350 only. Nothing pushed.

## Verification (all on a fresh `next build`, FRONTEND_ADAPTER=fixture APP_ENV=development)
- `npx tsc --noEmit`: exit 0. `npx eslint .`: exit 0. `npx vitest run`: 45 files, 699 tests passed (6 new in tests/unit/modules-operations/fixture-clock.test.ts).
- `next build`: build=0.
- Playwright, one fresh server per spec file, workers=1, root playwright.config.ts:

| spec | desktop-1280 | mobile-390 |
|---|---|---|
| lab (clinical gate off) | 9 passed, 1 skipped (release test needs FEATURE_CLINICAL=true) | 9 passed, 1 skipped |
| lab with FEATURE_CLINICAL=true (server + Playwright) | 9 passed, 1 skipped (gate-off test) | 9 passed, 1 skipped |
| ambulance | 9 passed | 9 passed |
| caretaker | 8 passed | 8 passed |
| admin-ops | 9 passed | 9 passed |
| cms | 6 passed | 6 passed |
| role-isolation (new) | 9 passed | 9 passed |
| public (regression check for the public page changes) | 50 passed, 1 skipped, 1 failed (pre-existing, see open issues) | 51 passed, 1 failed (same) |

Output tails (line reporter):
```
[desktop-1280] lab : 1 skipped, 9 passed (38.2s)
[desktop-1280] lab-clinical : 1 skipped, 9 passed (18.4s)
[desktop-1280] ambulance : 9 passed (13.8s)
[desktop-1280] caretaker : 8 passed (18.3s)
[desktop-1280] admin-ops : 9 passed (30.4s)
[desktop-1280] cms : 6 passed (25.5s)
[desktop-1280] role-isolation : 9 passed (2.2m)
[desktop-1280] public : 1 failed, 1 skipped, 50 passed (5.6m)
    1) public.spec.ts:65 unknown routes and unpublished stories show the localized 404 -- Expected: 404 Received: 200
[mobile-390] lab : 1 skipped, 9 passed (2.0m)
[mobile-390] lab-clinical : 1 skipped, 9 passed (2.2m)
[mobile-390] ambulance : 9 passed (1.3m)
[mobile-390] caretaker : 8 passed (1.7m)
[mobile-390] admin-ops : 9 passed (1.3m)
[mobile-390] cms : 6 passed (58.2s)
[mobile-390] role-isolation : 9 passed (2.1m)
[mobile-390] public : 1 failed, 51 passed (5.2m)   (same 404 test)
```

## App bugs fixed (app code)
1. Fixture clock vs fixture timeline (caused: driver A saw "No trip right now"; lab "today" empty). The ops fixtures describe 20 Nov 2026 but adapters used the wall clock. New `src/modules/admin/clock.ts`: in fixture mode the ops clock starts at `OPS_FIXTURE_EPOCH` 2026-11-20T06:00Z on first read and runs forward; `FIXTURE_NOW` overrides; http mode uses the real clock. Wired as the default `now` in lab/ambulance/caretaker/content/admin/audit fixture adapters and in the ambulance/caretaker/admin/content loaders.
2. Lab orders: a confirmed order scheduled for another day appeared in no queue. Added queue `scheduled` (scheduled or collecting, any day): `src/modules/lab/api.ts`, `fixture.ts`, `LAB_QUEUES` in `src/components/lab/lab-views.tsx`, `lab.orders.queues.scheduled` en/hi/te.
3. Lab recollection did not tell the manager which request was created. `ActionResult` ok case may carry `reference` (public booking reference only); `labRecollectionAction` returns it; `OpsAction` has `doneWithReference`; message `lab.orderDetail.recollectDoneWithReference` en/hi/te.
4. Public stories/FAQ never showed CMS-published content (request R-FE01-3 / R-E10). `src/components/public/stories-source.ts` now reads `@/modules/content/public`; `/stories` list (Suspense + `connection()`), `/stories/[slug]` renders the published snapshot with `RichText`; `/faq` adds a "More questions" section of published CMS FAQs (`public.faqPage.publishedTitle` en/hi/te). Fixture data shows `<FixtureNotice/>`; http mode stays empty/not-found. These files belong to the public-site workstream: please review.

## Spec fixes (behaviour was right, locator/copy ambiguous)
- RecordList renders a table (md+) and cards (<md), one hidden; text locators saw both. Added `shown()`, `record()`, `recordList()` in tests/e2e/support/operations.ts; row locators use `record()` so they work on mobile cards too.
- Streamed Suspense segments (`div[hidden][id^="S:"]`) briefly duplicate the page after load; `signInAs` now calls `settle()` (also exported, plus `open()`).
- Confirm dialogs are `alertdialog` and the confirm button repeats the action ("Decline", "Release", "Request recollection"); `confirmDialog(page, action)`.
- Copy sync in COPY: notFound += "could not find"; collectionFailed += "collection could not be completed"; errorSummary += "Fix N problems to continue"; reasonRequired narrowed to the error text (the placeholder option also says "Select a reason").
- CMS slug field is labelled "Address name"; lab order list opens `?queue=scheduled`; multi-lab test waits for the top bar to show "Synthetic Lab Nine" before asserting Lab One's order is gone; admin nav checks open the mobile "Open menu" sheet first (`workspaceNavigation`).
- Lab release test runs only when FEATURE_CLINICAL=true, the gate-off test only when it is not (`test.skip`), so both need two runs (table above).

## Assertions changed (intent kept)
- toast `getByRole("status")` checks: Radix's announce node is transient. Recollection now checks the toast region contains `#SCV-BKG-\d{6}`; CMS save checks the toast region says "saved"; collector start checks the job record shows "in progress"; caregiver check-in checks the shift moves to "Check out", shows "Checked in" and one more recorded time.
- CMS editor: the error summary takes focus (GOV.UK pattern), so the spec asserts summary focus, then that the summary link focuses Title; field errors are asserted as the inputs' accessible descriptions.
- Caretaker replacement: the UI never offers an unverified caregiver, so instead of choosing C and expecting "not eligible", the spec asserts exactly one "Assign replacement" button (the absent shift), C is not an option, B is, and confirming without a choice shows "Choose a caregiver."
- Caretaker services: `main` contains the required scope note "They do not give medicines, injections, wound care", so the clinical check is on the record lists and buttons.
- JS-disabled Call 112: footer link "Emergency? Call 112" goes to the guidance page; the spec checks every Call 112 link in `main` is `tel:112`.

## New coverage
- tests/e2e/role-isolation.spec.ts: signed out -> `/en/login?next=<path>` for lab/ambulance/caretaker/admin dashboards; labManager, ambulanceOperator, agencyManager, adminLead and patient.complete are redirected to their own landing (`/en/<role>/dashboard`, patient `/en/patient/dashboard`) and none of the requested area's synthetic records render (positive control on the own dashboard).
- Axe: lab, ambulance, admin dashboards and admin CMS list were already covered; added caretaker dashboard (caretaker.spec "dashboard shows real counts and the synthetic notice"). No serious/critical violations found, no app a11y fix needed.

## Open issues
- public.spec "unknown routes and unpublished stories show the localized 404": `/en/stories/anything` returns HTTP 200 with the 404 UI (soft 404). Pre-existing: with the base 57a103a versions of the three stories files the same build also returns 200 (partial prerender fallback shell for `/[locale]/stories/[slug]`). Owner: public-site workstream.
- Footer/header link text "Emergency? Call 112" points to /emergency, not `tel:112`. Consider renaming or making it a tel: link (public-site owner).
- Patient landing `/en/patient/dashboard` has no page yet (other workstream); role-isolation only checks the redirect URL and absence of ops data.
- Published story detail is a partial-prerender route; in fixture mode a newly published story could be served from the cached shell. Fine for the spec; revisit with the real CMS contract.
- te/hi strings added (lab queue, recollection message, FAQ heading) are unreviewed AI translations (src/messages/REVIEW_NEEDED.md process).
- No files under src/modules/auth or src/fixtures/identity/sessions.ts were edited.

## Scratch (not committed)
.context/*.ps1 (rebuild, restart-3350, run-e2e, run-all, regen-discover) and .context/*.txt. tests/e2e/zz-discover/ deleted.
