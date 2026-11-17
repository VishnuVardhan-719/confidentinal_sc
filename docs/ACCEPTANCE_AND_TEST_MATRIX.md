# Acceptance matrix — v2.3 pre-start supplement

Do not describe a screen as done if its backend or denial tests are missing. Record test evidence and commit hashes in `docs/TEST_EVIDENCE.md`.

| Journey | Positive acceptance | Critical negative test | Release classification |
|---|---|---|---|
| Public landing and content | Real brand-approved copy, services, about, genuine stories, contact | No fabricated testimonials, false provider count, broken mobile links | Public candidate |
| Account creation | OTP verified, patient answers required health questions truthfully using None/Unknown | No public signup to admin; throttling/resend abuse; no unneeded clinical data disclosure | Public candidate after privacy review |
| Provider onboarding | Individual/org document submission, review, staff membership and suspension | Unverified/self-approved/suspended/cross-org user cannot publish services | Public candidate after operations |
| Discover and request | PIN eligibility, current price and availability, patient selects provider | Unverified/out-of-area/suspended listing cannot be requested via direct API | Public candidate after operations |
| Manual acceptance | Provider accepts once; resource availability reserved transactionally | Simultaneous accept cannot double-book; stale price requires patient consent | Public candidate after tests |
| Mixed pay-after records | Collection method, amount, payer, payee and reconciliation truthfully recorded | Cash payment cannot be marked paid by Razorpay webhook; invoice not fabricated | Internal/staging pending tax rules |
| Doctor travel/OTP | Doctor assigned; en-route/arrived; one-use OTP verifies specific booking | Replay, guessed PIN, wrong doctor, expired OTP, 112 emergency handling unaffected | Clinical operational gate |
| 14 consultation items | Each DC01–DC14 has its own executed test and test-evidence link | Cross-patient/cross-provider access denied; unsigned drafts never shown as final | Synthetic staging until separately approved |
| Lab collection / reports | Collection assigned; result review before private report release | Collector cannot release results; signed links are scoped and expire | Booking candidate; reports separately gated |
| Ambulance scheduled | Authorized driver/vehicle accepted, schedule/pickup recorded | Emergency claim/booking not possible while dispatch disabled | Scheduled only |
| Caretaker | Approved permitted scope, assigned caregiver, check-in/audit | Unqualified caregiver cannot perform controlled clinical duties | Nonclinical only |
| Languages | English, Telugu, Hindi navigation/booking/errors reviewed; locale persisted | Medical/prescription strings not auto-translated without clinical approval | Public candidate for reviewed pages |
| Support/cancellation | Ticket ownership, escalation, fee-policy snapshots and notifications | No silent money loss or unapproved policy change | Service-specific approval |
| Live production | Client UAT, restore drill, alerting, credentials, security | Fail closed on release flags, wrong tenant, webhook retries and missing operations | Explicit written go/no-go |

## Mandatory performance/UX conditions

- Mobile 360px, 768px and desktop widths; keyboard navigation, screen-reader labels, high contrast, no-only-color statuses, reduced motion.
- Slow network recovery, duplicate form submission, reload mid-onboarding, loss of connectivity during booking, realtime reconnect/refetch.
- Search-index and SEO correctness for public language routes; do not index private health or booking pages.
- Use source-approved copy/photos and verify all visible call-to-action buttons actually work.

## Feature-level evidence rule

Each task moves from `IMPLEMENTED_UNVERIFIED` to `DONE_VERIFIED` only when it names commit(s), environment, test command, result and reviewer. For any requested DC01–DC14 element not done by November 23, mark `DEFERRED_BY_DESIGN` or `BLOCKED` honestly in client acceptance notes; do not imply all 14 were delivered.
