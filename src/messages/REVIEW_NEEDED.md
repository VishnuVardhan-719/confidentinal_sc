# Translations awaiting fluent review

All Telugu (`te`) and Hindi (`hi`) strings below were written by an AI agent (Kiro, FE01/FE02). They are real translations, not copies of English, but **none has been reviewed by a fluent speaker yet**. Do not treat them as approved for a public launch.

| Namespace | te | hi | Priority notes |
|---|---|---|---|
| `common` | unreviewed | unreviewed | Navigation, footer, gate/fixture/offline notices, form helpers |
| `accessibility` | unreviewed | unreviewed | Screen-reader labels |
| `errors` | unreviewed | unreviewed | API error messages, 404/error pages |
| `public` | unreviewed | unreviewed | All public pages (landing, about, FAQ, legal outlines, emergency) |
| `doctor` | unreviewed | unreviewed | Doctor workspace (FE10-FE12, Kiro D). Request/visit/OTP/travel wording |
| `clinical` | unreviewed | unreviewed | Consultation editor, signed records, amendments, facts, photo consent, proof, PDF, collection. Needs a fluent reviewer AND a clinician |
| `payment` | unreviewed | unreviewed | Payment status, summary, invoice/receipt states, cancellation dialog (money wording: review first) |
| `support` | unreviewed | unreviewed | Support ticket form and timeline |
| `common.notifications`, `common.account`, `common.roleNav`, `public.landing.search`, `public.storyPage` | unreviewed | unreviewed | Added in phase 2 / USER-REQ-1 |
| other namespaces | empty | empty | No strings yet |

## Review first (clinical wording, `doctor` / `clinical`)
- `clinical.review.ack`, `clinical.amend.*`: signing is irreversible; amendments are append-only. Hindi uses "करता/करती" to avoid assuming gender.
- `clinical.context.allergy*`, `clinical.prescription.allergy*`: an empty allergy list must never read as "no allergies".
- `clinical.facts.*`: "patient entered" vs "doctor verified" must stay distinct.
- `clinical.photo.*`: consent is specific and optional; declining does not block care.
- `clinical.collection.*`: offline collection does not change online payment status.
- Terms to confirm (hi): "परामर्श" consultation, "संस्करण" version, "संशोधन" amendment, "हस्ताक्षरित" signed, "अस्थायी" provisional, "विभेदक निदान" differential diagnosis.

## Review first (safety, legal or money wording)
- `public.emergency.*`: emergency guidance. Needs both a fluent reviewer and a clinical/first-aid reviewer (applies to the English source too).
- `public.legal.*`: draft legal outlines; wording must make clear nothing is in force.
- `public.faqPage.items.pay`, `.cancel`, `.price`, `.privacy`, `public.howItWorks.paymentBody`, `.cancelBody`: payment, cancellation and privacy statements.
- `public.landing.services.caretakers.caveat`: scope of non-clinical care.
- `public.landing.trust.*`, `public.howItWorks.verificationBody`: what "verified" does and does not mean.

- `payment.summary.method.payAfter`, `payment.cancellation.*`: must not suggest SureCure Visit holds money or that a fee is set by us.
- `support.form.privacyBody`, `support.form.sensitiveWarning`: privacy warnings.

## Terminology choices to confirm
- Telugu: "ప్రొవైడర్" (transliterated) for provider; "ధృవీకరించిన" for verified; "సంరక్షకులు" for caretakers; "ముసాయిదా" for draft.
- Hindi: "प्रदाता" for provider; "सत्यापित" for verified; "देखभालकर्ता" for caretaker; "मसौदा" for draft; "निर्धारित एम्बुलेंस" for scheduled ambulance.
- Hero headline is adapted, not literal: te "సంరక్షణ, మీ దగ్గరికే.", hi "देखभाल, आपके और करीब।" (English draft headline itself is unapproved per FRONTEND_MASTER §6).
- Hindi FAQ uses "सकता/सकती हूँ" in two questions to avoid assuming gender; reviewer may prefer a neutral rephrasing.

## How to record a review
Change the table row to `reviewed by <name/role>, <date>` and list any strings changed. Do not put reviewer contact details in this repo.

## `booking` namespace (fe-c2, 2026-11-18): te unreviewed, hi unreviewed
Doctor search, filters, LocationPicker, booking gate. Review first: `booking.search.symptoms.*` + `symptomHint` (clinical wording), `booking.gate.consentLabel/consentHint/healthUnverified` (consent), `booking.location.consent`, `booking.card.manualAcceptance`, `booking.profile.feeNote`.

## Operations namespaces (Kiro E, FE13-FE17)

| Namespace | te | hi | Priority notes |
|---|---|---|---|
| `lab` | unreviewed | unreviewed | Collection/report status wording, failure reasons, report release confirmations |
| `admin` (ops kit; admin/CMS pages to follow) | unreviewed | unreviewed | Access denied, not-connected, organization switcher |

Review first: `lab.status.collection.processingHandoff` must never read as "report ready" (S01-Q08); `lab.reports.*` release wording; `lab.failure.*` must not blame the patient.
| `ambulance` | unreviewed | unreviewed | Emergency/112 wording (`ambulance.emergency.*`) needs fluent and safety review; no ETA wording allowed |
| `caretaker` | unreviewed | unreviewed | Non-clinical scope note (`caretaker.scopeNote`), task names, recurring-plan gate |
| `admin` (all pages incl. CMS) | unreviewed | unreviewed | Payments/refund gating wording, consent-gate wording (`admin.cms.publishBlocked.*`) |
