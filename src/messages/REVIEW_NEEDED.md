# Translations awaiting fluent review

All Telugu (`te`) and Hindi (`hi`) strings below were written by an AI agent (Kiro, FE01/FE02). They are real translations, not copies of English, but **none has been reviewed by a fluent speaker yet**. Do not treat them as approved for a public launch.

| Namespace | te | hi | Priority notes |
|---|---|---|---|
| `common` | unreviewed | unreviewed | Navigation, footer, gate/fixture/offline notices, form helpers |
| `accessibility` | unreviewed | unreviewed | Screen-reader labels |
| `errors` | unreviewed | unreviewed | API error messages, 404/error pages |
| `public` | unreviewed | unreviewed | All public pages (landing, about, FAQ, legal outlines, emergency) |
| `payment` | unreviewed | unreviewed | Payment status, summary, invoice/receipt states, cancellation dialog (money wording: review first) |
| `support` | unreviewed | unreviewed | Support ticket form and timeline |
| `common.notifications`, `common.account`, `common.roleNav`, `public.landing.search`, `public.storyPage` | unreviewed | unreviewed | Added in phase 2 / USER-REQ-1 |
| other namespaces | empty | empty | No strings yet |

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
