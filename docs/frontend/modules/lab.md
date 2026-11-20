# Lab workspace

Module `src/modules/lab`. Pages `src/app/[locale]/lab/**`. Components `src/components/lab`. Updated 2026-11-20 (R9-E3).

## Routes and who may open them (`routes.ts`)

| Route | Allowed |
|---|---|
| `dashboard`, `support` | any active member, or a member with billing access |
| `branches`, `catalog`, `staff`, `orders` | manager |
| `collections` | collector (assigned jobs only) |
| `reports` | reviewer (never an ordinary collector) |
| `billing` | members with billing access |

Navigation is built from the same rules, so members only see what they may open. The guard still decides every request.

The lab roles `manager`, `collector` and `reviewer` are frontend scopes. Their mapping to I01 membership roles is open (R-E08).

## Rules (`rules.ts`, mirrors S01; the server stays the authority)

- **Collections:** `scheduled` to `collecting` to `collected` to `processing_handoff`, with failures `collection_failed` and `handoff_failed`. A failure needs a reason from `LAB_FAILURE_REASONS`. A handoff must go to the order's own branch.
- **Recollection:** offered only after a failure, and it always creates a new booking, never a reset.
- **Order totals:** server-derived. `orderTotalsConsistent` flags a mismatch (line total equals unit price times quantity, and the sum equals the order total) instead of recomputing a price.
- **Catalog prices:** integer paise, capped at `MAX_CATALOG_PRICE_PAISE` (₹1,00,00,000). Text input is parsed with `rupeesToPaise` without floats. The editor shows the value with `paiseToRupeesString`.
- **Reports:** `uploaded` to `reviewed` to `released`. Review and release need the `clinical` flag on, an active membership in the same provider, and the reviewer role. A reviewer may not review a file they uploaded. Release happens only after review. Payment, upload or collection never releases a report.
- **Copy:** completion text never says "report ready" (S01-Q08). Turnaround claims are stored but not shown (S01-Q05).

## Feature gate

`FEATURE_CLINICAL` (default off). With it off, `/lab/reports` shows the gate notice and no report data, and the fixture adapter refuses review and release. Lab report release stays off in production until the clinical release gate passes.

## Data and adapters

- `fixture.ts` holds mutable synthetic state shared per process, so changes survive a refresh. Collectors see only their assigned orders, and managers see all orders of their lab.
- `http.ts`: no lab endpoint is documented yet, so every method returns `gated` (R-E07). S01 proposes `POST /api/bookings/:id/lab/{start-collection,collected,handoff,collection-failed,handoff-failed}`.
- The billing and support pages render a "not connected" notice (no contract).

## Tests

- Unit: `tests/unit/modules-operations/lab.test.ts`, `lab-pages.test.ts`, `lab-branches.test.ts`.
- E2E: `tests/e2e/lab.spec.ts`. Run it twice, with and without `FEATURE_CLINICAL=true` (server and Playwright): the release test and the gate-off test each skip in the other run. `role-isolation.spec.ts` covers cross-role access, and `a11y-sweep-e.spec.ts` covers axe and overflow at 390 and 1280.

## Open

- Contracts for branches, catalog, staff, order queues, collections and reports (R-E07).
- The lab feature flag `FEATURE_LAB` from S01 is not in `FEATURE_FLAGS`, and whether `clinical` is the right gate for report release needs confirming (R-E03).
- The collector and reviewer scope names (R-E08).
