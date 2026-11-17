# Frontend handoff (H01 draft)

Written 2026-11-17. Base: `develop`. Owner still directs overall work. This file is for the friend who takes frontend/UI tickets.

## Setup

```
git clone https://github.com/VishnuVardhan-719/confidentinal_sc.git
cd confidentinal_sc
git checkout develop
npm ci
cp .env.example .env     # fill in your own values; never commit .env
npm run dev
```

Before opening a PR, all four must pass: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Read first (in this order)

1. `README.md`: rules, stack and safety constraints.
2. `DESIGN.md`: the proposed design direction.
3. `docs/IMPLEMENTATION_TASKS.md`: the task ledger.
4. `docs/API_CONTRACTS.md` and `docs/PERMISSIONS.md`: what the UI may call and who may see what.
5. `docs/CANONICAL_SCHEMA_DRAFT.md`: data shapes (approved with defaults, see `docs/S00_DECISION_SHEET.md`).

## Rules that apply to every UI ticket

- Stack: Next.js App Router, strict TypeScript, Tailwind, shadcn/ui, Zod.
- Synthetic data only. No real patient data, no real-looking listings, no invented prices, coverage areas or ETAs.
- Feature flags default OFF. Use `isEnabled()` from `src/lib/feature-flags`. Clinical, live payments, emergency dispatch, pharmacy, subscriptions, GPS and payouts stay hidden unless a flag is explicitly on.
- Money is integer paise. Times are UTC in the database; format in IST only in the UI.
- No secrets in client code. Only `NEXT_PUBLIC_*` values reach the browser.
- Every screen needs loading, error and empty states, and must work on mobile and with a keyboard.
- No placeholder claims about medical outcomes, "paid", "verified" or "report delivered" unless the real state says so.
- One branch per task: `task/<ID>-short-name`, branched from `develop`. Do not edit the same files as another open task. Record changes in `docs/SESSION_LOG.md` and test evidence in `docs/TEST_EVIDENCE.md`.

## Tickets

### Can start now (no backend needed)

| Ticket | Work | Done when |
|---|---|---|
| U01-a | App shell: root layout, navigation, design tokens from `DESIGN.md`, responsive container | Renders on mobile and desktop, passes build |
| U01-b | Shared components: buttons, inputs, form field with Zod error display, loading, error and empty-state components | Each has a small test or story, keyboard accessible |
| U01-c | Static public pages: home, how it works, provider categories (doctor, lab, scheduled ambulance, caretaker) | No coverage, price or availability claims; wording reviewed by owner |

### Blocked until the backend exists (do not mock with fake data)

| Ticket | Blocked on |
|---|---|
| U01-d Public search/discovery | C01 (catalog, PIN coverage) |
| U01-e Patient booking flow and dashboard | B01 (booking engine), I01 (auth) |
| U01-f Provider dashboard (accept/decline) | B01, I02 |
| U01-g Admin verification screens | I02 |
| DC03, DC09, DC13, DC14 UI parts | Clinical work after core booking, behind the clinical flag |

The owner and Claude build I01, B01 and C01 first. When a backend ticket lands, the matching UI ticket moves to "ready" in the ledger.

## Open client decisions that affect UI copy

No invoice or receipt wording, no "paid" status, no cancellation-fee wording and no support-hours promise until the owner records the client's answer (see Q02 to Q10 in `docs/S00_DECISION_SHEET.md`).
