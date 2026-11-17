# SureCure Visit: end to end (2026-11-17)

Staging target: Nov 23, 2026. Private staging, synthetic data only. Not a production launch.

## What the product does

A marketplace for four provider categories: doctor, lab, scheduled ambulance, caretaker. Roles: patient, provider (individual or organization with staff), admin.

## The core journey (what must work end to end)

1. **Sign up and log in** (patient or provider). Real auth, not mocked.
2. **Provider onboarding:** the provider submits profile, category, coverage PINs, prices and documents (private storage).
3. **Admin verification:** admin approves, rejects or suspends. Only approved providers are published.
4. **Patient search:** by category and PIN. Shows only verified providers with real coverage. No fake listings, ratings or ETAs.
5. **Booking request:** the patient picks a provider and confirms. Price is snapshotted by the server.
6. **Provider decision:** the provider manually accepts or declines. Acceptance is atomic (no double booking). The patient exact address and contact are shown to the provider only after acceptance.
7. **Cancel:** by either side, under the approved policy.
8. **Pay-after record:** the provider reports collection. It is recorded as "reported", never "paid" or gateway-paid.
9. **Dashboards:** patient, provider and admin, with an audit trail.

Later, after core booking and behind flags: clinical consultation DC01 to DC14, online payment (test mode), reports.

## Build order and ownership

| Step | Task | Owner |
|---|---|---|
| 1 | F01 foundation (done, on `develop`) | Done |
| 2 | I01 auth, roles, organizations, RLS | Owner (backend) |
| 3 | I02 provider onboarding and admin verification | Owner (backend) |
| 4 | C01 catalog, pricing, PIN coverage | Owner (backend) |
| 5 | B01 booking engine | Owner (backend) |
| 6 | P01 pay-after records | Owner (backend) |
| Parallel | U01 UI: shell, components, then screens as each backend step lands | Friend (frontend) |
| 7 | Q01 security and end-to-end tests, then R02 staging and acceptance | Both |

## Frontend/backend split (so nobody edits the same files)

| Area | Owner |
|---|---|
| `src/app/**` pages and layouts (except `src/app/api/**`), `src/components/**`, styles, `public/` | Friend |
| `src/app/api/**`, `src/lib/**`, `supabase/**`, `tests/**` for backend, CI, env, migrations | Owner |
| `docs/API_CONTRACTS.md` and shared Zod schemas | Owner writes; friend reads. Change by agreement only. |

The seam is the API contract. The friend builds UI against `docs/API_CONTRACTS.md` and the Zod types. When a backend endpoint lands, the owner tells the friend and the matching screen gets wired to it. Until then the friend must not invent fake provider data.

## Definition of done for Nov 23

Core journey 1 to 9 works on private staging with synthetic data, RLS tests pass, lint/typecheck/test/build are green, and open client decisions (Q02 to Q10) are listed as deferred, not silently decided.
