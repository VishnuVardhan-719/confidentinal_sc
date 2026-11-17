# S00 decision sheet: canonical schema approval

Source: `docs/CANONICAL_SCHEMA_DRAFT.md` (branch `task/S00-erd-draft`). Date: 2026-11-17.

**Ask:** approve the schema draft with the safe defaults below, so migrations (F01 -> I01) can start. Every default keeps the system synthetic-data-only and staging-only. Nothing here enables real patients, real money or clinical use.

Reply format: "Approve all defaults", or list the Q numbers you want to change.

## A. Engineering defaults (you can approve now)

| Q | Decision | Default in draft | Recommendation |
|---|---|---|---|
| Q01 | Patient model and delegation | Separate patient rows and grants. Self-booking only at first. No automatic guardian or adult access. | Approve |
| Q06 | Provider model | One provider row per owner and category. Only individually verified clinicians can be assigned. | Approve |
| Q08 | Lab completion event | Show "collection/processing done". Never say "report delivered". Report release is P2. | Approve |
| Q11 | Technical horizons | 60-second private links, bounded retries, durable dedupe tombstones, references never reused. Exact values to be reviewed. | Approve |
| Q12 | Pricing | Fixed server-side prices only. Quotes, online payment and recurring billing come later. | Approve |

## B. Client or legal answers (approve the safe default, answer later)

These need the client, a lawyer or finance. The default blocks the risky feature until the answer arrives. It does not block building the core booking flow.

| Q | Open question | Safe default (what stays off) | Blocks |
|---|---|---|---|
| Q02 | Expiry, cancellation and no-show rules, fees | No expiry, no penalties invented | Public go-live |
| Q03 | Legal merchant, invoice issuer, GST | No invoices or receipts, no online collection | Any real payment |
| Q04 | Who confirms provider-collected cash or UPI | No "paid" state. Collector reports only. | Pay-after flow |
| Q05 | Data retention, consent, hosting | Synthetic data only | Any real patient data |
| Q07 | Real PINs, hours, capacity, buffers | Exact verified PINs only, no promised ETA | Real availability |
| Q09 | Clinical signatory and DC01-DC14 acceptance | All 14 kept in P2, no clinical activation | Clinical go-live |
| Q10 | Support owner, hours, escalation | No 24/7 promise | Public go-live |

## C. Related P0 items from the pack (not schema, still open)

- Legal entity and merchant/invoice issuer (same as Q03).
- D-POL: payment policy matrix.
- D-PRIV: privacy approver.
- Nov 23 acceptance list: confirm "core booking works end to end on staging, synthetic data" is the pass bar.

## What approval unlocks

1. I merge the task branches into `develop` locally.
2. One migration author is assigned (me, to avoid schema conflicts).
3. Supabase CLI is installed (Docker must be running) and I01 auth/RLS begins.
