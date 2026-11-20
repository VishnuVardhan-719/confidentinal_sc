# Owner decisions pending (2026-11-19)

One list of every open decision the agents are blocked on or are working around with a default.
Nothing here is approved. Agents build with the **default** until the owner records an answer in
`docs/DECISIONS.md`. Answer by ID ("OD-2: Ravi, 9am-9pm") and Claude applies it.

## Blocks release (answer before any real booking or money)

| ID | Question | Default the agents use | Source |
|---|---|---|---|
| OD-2 | Who holds `booking:incident` (ops escalation), and in which hours? | Nobody. All four flows stay synthetic demos; work an assignee cannot close stays open. | P5 contract §6.2 |
| OD-5 | Seed value of the doctor feature gate | `off` (like lab, ambulance, care) | P5 contract §10.2 |
| D-1 (Q04) | Who confirms provider-collected cash/UPI, with what evidence? | Nobody; `paid_enabled = false`; no booking can become paid | P01 v1.2 §14 |
| D-13 | When may `paid_enabled` be turned on, and by whom? | Off; only by a reviewed migration after D-1 | P01 v1.2 §14 |
| D-14 | Gateway/webhook (P01b): defer, separate ticket, or in core? | **A: defer P01b, build P01a (pay-after) only.** Recommended. | P01 v1.2 §14 |
| D-5 (Q02) | Cancellation, no-show and interruption fees | None | P01 v1.2 §14 |
| D-7 (Q03) | Merchant of record, invoice/receipt issuer, GST | No invoices, receipts or tax fields | P01 v1.2 §14 |
| D-CLIN | Which DC01-DC14 doctor capabilities are in the Nov 23 acceptance? | Core first (DC01, DC02, visit commands); DC13 photos and DC14 PDF last | IMPLEMENTATION_TASKS |
| D-PRIV | Health-data notices, retention, consent, minors, vendor roles | Not approved; synthetic data only | IMPLEMENTATION_TASKS |

## Shapes behaviour (defaults are safe; change any time before launch)

| ID | Question | Default |
|---|---|---|
| OD-1 | May a lab scheduler (not the reporter) confirm `no_show`? | No, ops only |
| OD-3 | May ops read patient contact while handling an exception? | Yes, only with an open exception, audited |
| OD-4 | May provider schedulers see exact address and phone? | No, PIN only; assignee sees contact |
| OD-6 | How is a feature gate changed? | Reviewed migration or recorded owner SQL; no in-app switch |
| OD-7 | Early slot release when lab/care finish early? | Lab and care release; doctor and ambulance keep the buffer |
| OD-8 | When may ops close a booking without an open exception? | After `end_at + 12 h`, or when the assignee can no longer close |
| OD-9 | May an assignee see the booking amount? | No; P01 adds a separate collector view |
| D-2 | Pay-after reporting window | 72 hours |
| D-3 | May patients dispute? Patient acknowledgement? | Yes, max 1 open / 3 total; no acknowledgement |
| D-4 | Over-collection | Reject |
| D-6 | Zero-amount bookings | Shown as "No charge", never `paid` |
| D-8 | Two-person approval for finance overrides? | One `finance:override` holder with AAL2; granted to nobody |
| D-9 | Idempotency / webhook inbox retention | Keep (no personal data) |
| D-10 | Which provider members collect / read amounts | Individual owners collect their own; org owners read |
| D-11 | Test-mode captures drive payment state on staging? | No |
| D-12 | Duplicate UPI reference; accepted formats | Flag, don't block; 12-digit UTR only |
| E-1 | Payments worker role | `service_role`, server-only, execute on `payments_worker.*` only |
| E-2 | Scheduler for the reconciliation job | None; run by hand on staging |

## Project / repo

| ID | Question | Recommendation |
|---|---|---|
| R-1 | Repo `confidentinal_sc` is **public** and holds confidential specs and a Gmail address in commit metadata | Make it private |
| R-2 | Merge `integ/all` into `develop` (and later `main`)? | Yes, after the shared engine and doctor core land with green suites |
| R-3 | Friend's frontend (`feat/fe2-*`) is based on `develop` with fixture data, not `integ/all` | Merge backend to `develop` (R-2) so the friend can switch fixtures to real APIs using `docs/HANDOFF_FRONTEND.md` |
| R-4 | One migration author at a time (AGENTS.md) | Keep for the shared block; after it merges, allow lab/ambulance/care/P01 authors in parallel (disjoint number blocks, DB lock serialises test runs) |
| R-5 | Keep `.context/build_b01_forward.py` and `.context/prepare_b01_suites.py` in the repo? | Move to `tools/` or delete |
| R-6 | No `supabase/seed.sql` | Done 2026-11-20: opt-in synthetic demo seed `supabase/seeds/local_demo.sql` (not loaded by `db reset`; see HANDOFF_FRONTEND.md) |
