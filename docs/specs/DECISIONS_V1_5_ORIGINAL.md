# SureCure Visit — Decision Register (authoritative v1.5)

Status terms: **CONFIRMED** = chosen by project owner in conversation; **PROPOSED** = engineering recommendation not approved; **OPEN** = needs client decision. This file supersedes older planning guesses elsewhere in the inherited v1.3 kit.

| Ref | Status | Decision |
|---|---|---|
| D01 | CONFIRMED | Brand **SureCure Visit**; domain **surecurevisit.in** via GoDaddy. **No confirmed legal company name**. Do not associate external companies. |
| D02 | CONFIRMED | Commercial responsive website first; no native apps in first release. |
| D03 | CONFIRMED | Six top-level roles: patient, doctor, lab, ambulance, caretaker, admin. Individuals and companies can onboard; organization staff memberships required. |
| D04 | CONFIRMED | Patient chooses provider; provider sets price and **manually accepts** booking. |
| D05 | CONFIRMED | Pan-India discovery, bookable only where **verified and operational** provider coverage exists. |
| D06 | CONFIRMED | Mixed payment collection: gateway online OR pay provider after service; record collection path. |
| D07 | CONFIRMED | Hybrid cancellation: platform protections + service-specific policies. |
| D08 | CONFIRMED | Shared support: provider resolves service issues; central admin owns escalations, disputes and platform issues. |
| D09 | CONFIRMED | Full rebrand, not copied screenshots; no AI slop; Three.js, Anime.js (interpreted from 'animate.js'), selected 21st.dev components; restrained motion on clinical flows. |
| D10 | CONFIRMED | Language support English, Telugu, Hindi across public/private/onboarding/communications where feasible. |
| D11 | CONFIRMED | Every non-patient primary provider/admin profile has a permanent `#` human ID; patient has internal UUID, no public patient ID. Also booking/visit/reference IDs. |
| D12 | CONFIRMED | Doctor acceptance → booking confirmation/reference → arrival OTP → verified arrival/consultation → real-time patient status → clinical record, prescription/PDF, health history, optional photo and QR proof. |
| D13 | CONFIRMED | Patient health questionnaire is **mandatory to complete** before normal bookings: blood group, allergies, current meds, surgeries, medical history, family section, documents section; explicit Unknown/None/No documents supported. Emergency help must not be gated. |
| D14 | CONFIRMED | Family/Plus/Pro concepts, caregiver recurring care and future medicine ordering desired, but prices/benefits not approved. |
| D15 | CONFIRMED | Floating WhatsApp button and eventual booking automation; website AI assistant for FAQs/search/booking assistance. |
| D16 | CONFIRMED | AI provider **Ollama Cloud** API; **only genuinely free included inference**, no paid fallback. Website works without AI. |
| D17 | CONFIRMED | Cloud hosted 24/7 website/backend/database; not reliant on developer laptop. 24/7 availability is a goal, not guaranteed uptime or staffed medical coverage. |
| D18 | CONFIRMED | Dev tools Claude Code CLI + Codex CLI in separate Git worktrees, Google Antigravity **editor only**, no Antigravity AI agents; ChatGPT used for planning/review. |
| D19 | CONFIRMED | Claude Pro, ChatGPT Plus, Antigravity, GoDaddy domain already owned. Don't purchase again. |
| D20 | CONFIRMED | Quoted dev budget ~₹10,000; deadline 23 Nov 2026. User has **not started development** and explicitly says **do not start coding or issue CLI prompts until START**. |
| D21 | PROPOSED | Next.js TypeScript + Supabase cloud Postgres/Auth/private storage + Vercel Pro commercial + next-intl; one modular monolith. |
| D22 | PROPOSED | Default implementation ownership Claude UI/UX, Codex backend/tests; peer review and one integrator. |
| D23 | PROPOSED | Booking-confirmation issued on acceptance; invoice/payment receipt depends on legal supplier/tax/payment facts; clinical and financial states separate. |
| D24 | PROPOSED | Urgent ambulance help exposes 112, with regulated/live emergency dispatch OFF until actual staffed operations confirmed. |
| D25 | OPEN | Legal entity, invoice issuer, tax treatment, merchant owner, payment settlement and marketplace monetization. |
| D26 | OPEN | Exact cancellation fees/windows and service-specific refund/no-show conditions; subscription plan prices, benefits and pharmacy partner. |
| D27 | OPEN | Provider-credential reviewers, dispatch team, customer support staffing, incident/escalation SLAs, consent/retention and live geographic locations. |
| D28 | OPEN | Existing CureVist site source/backend data counts and migration scope; current website cannot reveal private user data. |
| D29 | OPEN | Final logo, editorial art/photos, tone, approved legal content, published stories and real provider claims. |

### Conflict resolution note
Older v1.3 master document described some clinical and AI functions as deferred. User later explicitly requested **all 14 consultation functions by Nov 23**. They are **requested implementation targets**, but no credible guarantee of secure production launch in seven days is made. The updated schedule in DAY_BY_DAY_PLAN and release gates govern actual launch readiness.
