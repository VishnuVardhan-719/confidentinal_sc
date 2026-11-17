# Implementation Task Board (PLANNING ONLY)

No coding started; these are future tickets, not completed tasks. Each ticket passes tests and peer review, not just UI appearance.

| ID | Dependency | Owner | Outcome | Minimum verification |
|---|---|---|---|---|
| F01 | START | Integrator | One Next.js+TS+Tailwind+Supabase foundation and CI | build/typecheck/tests + no secrets |
| F02 | F01 | Claude | Custom design tokens, navigation and localized shell | 3 locale snapshots, keyboard navigation |
| R01 | F01 | Codex | Supabase identity/org/role/RLS schema | multi-role negative policy tests |
| R02 | R01/F02 | Claude | Signup and mandatory patient questionnaire UI | Unknown/None accepted, validation |
| R03 | R01 | Codex | Provider docs, review, activation and IDs | unverified not discoverable; unique refs |
| P01 | F02/R03 | Claude | Public landing/about/stories and provider search | SEO, mobile, no fake claims |
| B01 | R01/R03 | Codex | Transactional booking, price snapshot, accept/decline | concurrent acceptance no double booking |
| B02 | B01 | Claude | Patient booking/doctor action dashboards | E2E booking request → accept |
| V01 | B01 | Codex | Arrival OTP hash/expiry/attempts/replay checks | wrong doctor/expired/replay denied |
| V02 | V01 | Claude | OTP and real-time timeline UI | authorized patient updates, reconnect |
| C01 | V01 | Codex | Consultation drafts/versioning/auth | unrelated physician blocked |
| C02 | C01 | Claude | Vitals/assessment/prescriptions/care plan editor | autosave failure/recovery and mobile |
| C03 | C01/C02 | Codex | Finalize/sign records, clinical amendments | append-only, unauthorized edits rejected |
| C04 | C03 | Claude | Patient record, PDF view, QR and photo consent UI | accessibility/private records |
| C05 | C03 | Codex | PDF/QR/private storage/verified history/photo records | expiring QR, consent and access tests |
| S01 | R/B | Codex | Lab order/collection states | cross-org collection access denied |
| S02 | R/B | Codex | Care plan/shifts | overlapping shift assignments blocked |
| S03 | R/B | Codex | Scheduled ambulance states | verified driver/vehicle assignment |
| S04 | S01/S02/S03 | Claude | Lab/care/ambulance dashboards | basic E2E per service |
| M01 | B | Codex | Pay-after ledger and gateway sandbox | funds not marked paid from client UI |
| N01 | B | Codex | Durable notification outbox | retries and dedupe |
| X01 | F02 | Claude | Floating WhatsApp, language review, animation polish | no blocking booking, reduced motion |
| X02 | P01/R03 | Codex | Optional no-paid Ollama FAQ/search | zero-spend gate, safe fallback |
| Q01 | All ready items | Both | RLS, E2E, accessibility, mobile, monitoring | documented test results |
| Q02 | Q01 | Integrator/client | Staging handover or live release | formal release approval |

Work time boxes and exact calendar order: `DAY_BY_DAY_PLAN.md`. Any incomplete/untested feature is not public production ready.
