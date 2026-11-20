# te/hi terminology glossary

Status: **proposal**. Written by an AI agent (Kiro fe-b, R9-E5, 2026-11-20). The canonical forms below need a fluent Telugu and Hindi reviewer, the same as all te/hi copy (`src/messages/REVIEW_NEEDED.md`). No message file was changed for this document.

## How this was measured

- **Sources (both read-only):**
  - `feat/fe2-e` `src/messages/{en,te,hi}/*.json`: 1,917 keys in 16 namespaces. `booking`, `clinical`, `doctor`, `patient`, `payment` and `support` are empty on this branch.
  - The committed `src/messages` of `feat/fe2-integration` `fec9da1`, exported with `git archive`, because it has the booking, doctor, clinical, patient and services namespaces. Integration-only keys are marked *(int)*.
- **Method:** for every English message that contains a term (regex on the English text, e.g. `\bbookings?\b`), the te and hi values were sorted by which rendering they contain. Stems were found by co-occurrence first, then listed by hand, and every message with no known rendering was read. A count means number of messages.
- **Owners,** from commit history and REQUESTS:
  - fe-a: `common`, `public`, `accessibility`, `errors`, `payment`, `support`
  - fe-b: `auth`, `onboarding`, `admin`, `lab`, `ambulance`, `caretaker`
  - fe-d: `doctor`, `clinical`, `consultationNotes`, `prescriptionDrafts`, `doctorReviews`, `verify`
  - fe-q: `booking`, `services`
  - fe-p: `patient`, `patientAccount` (some `patient.booking.*` keys came from fe-d)
- **Structure:** key and placeholder parity is enforced by `tests/unit/i18n-structural-parity.test.ts` (68 tests on fe2-e, 92 on the integration export, all pass). Wording is not tested. This glossary covers wording.

## Canonical renderings (proposed)

| Term (en) | Hindi | Telugu | Usage today | Agreement |
|---|---|---|---|---|
| booking / book | बुकिंग; verb बुक करना | బుకింగ్ (pl. బుకింగ్‌లు); verb బుక్ చేయు | hi 45, te 43 on fe2-e; 147 / 144 *(int)* | consistent |
| request (noun) | अनुरोध | అభ్యర్థన | hi 68, te 71; 186 / 196 *(int)* | consistent; verb uses are allowed, see notes |
| accept | स्वीकार करना; status "स्वीकार किया गया" | అంగీకరించు; status "అంగీకరించబడింది" | hi 41, te 38 | **te disagrees in 4 keys** (D-3) |
| approve (kept separate from accept) | स्वीकृत | ఆమోదించు / ఆమోదించబడింది | admin, onboarding | consistent |
| decline (provider declines a request) | अस्वीकार करना; status "अस्वीकार किया गया" | తిరస్కరించు; status "తిరస్కరించబడింది" | hi 10, te 12 | **hi disagrees in 2 keys** (D-4) |
| cancel / cancellation | रद्द करना / रद्दीकरण | రద్దు చేయు / రద్దు | hi 19, te 18 | consistent |
| reschedule | समय बदलना | సమయం మార్చు | *(int only)* 5 keys in `patient` | consistent (one phrasing variant, D-10) |
| payment | भुगतान | చెల్లింపు | 29 / 29; 72 / 72 *(int)* | consistent |
| refund | रिफ़ंड (with nukta); status "रिफ़ंड किया गया" | రీఫండ్; status "రీఫండ్ చేయబడింది" | 16 / 16 | **status labels disagree** *(int)* (D-5) |
| doctor | डॉक्टर | డాక్టర్ (pl. డాక్టర్లు) | hi 25 (all); te 14 vs 11 on fe2-e, 137 vs 12 *(int)* | **te disagrees** (D-1) |
| lab / laboratory | लैब | ల్యాబ్ | hi 20, te 19 short form | **long forms in 9 hi / 9 te keys** (D-2) |
| ambulance | एम्बुलेंस | అంబులెన్స్ | 19 / 19 | consistent |
| caretaker / caregiver | देखभालकर्ता | సంరక్షకులు (singular సంరక్షకుడు where grammar needs it) | 42 / 42 | **te 1 key** *(int)* (D-6) |
| admin | एडमिन | అడ్మిన్ | 15 / 15 | workspace title differs (D-7) |
| appointment (outside appointments, not a SureCure booking) | अपॉइंटमेंट | అపాయింట్‌మెంట్ | 2 / 2 | consistent |
| prescription | प्रिस्क्रिप्शन | ప్రిస్క్రిప్షన్ | *(int only)* hi 9 vs 1, te 10 | **hi 1 key** (D-8) |
| report (lab report, noun) | रिपोर्ट | రిపోర్ట్ (pl. రిపోర్టులు) | hi 24, te 23 | **te 1 key** (D-9) |
| verify / verified / verification | सत्यापन / सत्यापित | ధృవీకరణ / ధృవీకరించిన | 71 / 71 | **arrival status differs** *(int)* (D-11) |
| OTP / verification code | सत्यापन कोड; short कोड | ధృవీకరణ కోడ్; short కోడ్ | 1 / 1 | consistent; English copy says "verification code", not "OTP" |
| profile | प्रोफ़ाइल (with nukta) | ప్రొఫైల్ | 14 / 13 | consistent |

Allowed variants (same English word, different meaning; not disagreements):
- **request:** "requested" as a past participle may use माँगा / మార్పులు కోరబడ్డాయి. Examples: `caretaker.requests.columns.time` "माँगा गया समय", `onboarding.providerStatus.changes_required` "बदलाव माँगे गए" / "మార్పులు కోరబడ్డాయి", `doctor.arrival.resend` *(int)* "नया कोड माँगें".
- **decline:** for a patient refusing consent, use मना करना / నిరాకరించు, as in `clinical.photo.*` *(int, fe-d)*. A provider declining a request uses अस्वीकार / తిరస్కరించు.
- **report:** "report a problem" (verb) uses बताएँ / నివేదించండి (`ambulance.driver.interrupt`, `caretaker.assignments.actions.interrupt`). "Report arrival" uses सूचना दें / తెలియజేయండి *(int)*.
- **verify:** "checks your documents" uses जाँचती / తనిఖీ (`public.becomeProvider.reviewBody`). In English that is "check", not "verify".
- **booking:** the slug example `admin.cms.fields.slugHint` keeps the Latin "how-booking-works" on purpose.

## Disagreements

Each row lists the keys that differ from the proposed canonical form. Requests to owners: `docs/frontend/REQUESTS.md` R-E9E5-01.

| ID | Term | Locale | Keys that differ (current value) | Owner | Proposed |
|---|---|---|---|---|---|
| D-1 | doctor | te | `auth.roles.doctor` "వైద్యుడు" (the signup role label); `onboarding.profile.lead`, `onboarding.profile.unverifiedBody`, `onboarding.profile.sharingBody` (వైద్యులు / ఒక వైద్యుడు) | fe-b | డాక్టర్ / డాక్టర్లు |
| D-1 | doctor | te | `common.meta.defaultDescription`; `public.meta.landing.description`, `public.meta.becomeProvider.description`, `public.landing.hero.lead`, `public.landing.providers.roles.doctor.title` "వైద్యులు", `public.about.lead`, `public.faqPage.items.whatIs.a` | fe-a | డాక్టర్లు |
| D-2 | lab | hi | `lab.workspaceLabel` "प्रयोगशाला" | fe-b | लैब |
| D-2 | lab | hi | `public.meta.becomeProvider.description`, `public.landing.services.labTests.body`, `public.landing.providers.roles.lab.title`, `public.about.lead`, `public.faqPage.items.whatIs.a`, `public.becomeProvider.roles.lab.title`, `public.becomeProvider.roles.lab.cta` "लैबोरेटरी" | fe-a | लैब |
| D-2 | lab | te | `auth.roles.lab` "ప్రయోగశాల" (signup role label), `lab.workspaceLabel` "ప్రయోగశాల" | fe-b | ల్యాబ్ |
| D-2 | lab | te | the same seven `public.*` keys as hi: "ల్యాబొరేటరీ / ల్యాబొరేటరీలు" | fe-a | ల్యాబ్ / ల్యాబ్‌లు |
| D-3 | accept | te | `ambulance.status.credential.rejected`, `caretaker.status.credential.rejected`, `lab.status.credential.rejected`, `onboarding.providerWizard.evidenceStatus.rejected` *(int)*: "ఆమోదించబడలేదు" (not approved) for English "Not accepted"; hi says "स्वीकार नहीं किया गया" (not accepted) | fe-b | అంగీకరించబడలేదు, or change English to "Not approved" and keep te. Product choice |
| D-4 | decline | hi | `public.landing.how.steps.accept.body`, `public.howItWorks.patient.accept.body`: "मना करते हैं" | fe-a | अस्वीकार करते हैं (matches `booking.status.declined` *(int)* "अस्वीकार किया गया") |
| D-5 | refund (status) | hi | `patient.booking.payment.refunded` *(int)* "वापस किया गया"; every other "Refunded" says "रिफ़ंड किया गया", or "रिफ़ंड हो गया" in `payment.status.refunded` | fe-p / fe-d; fe-a for `payment` | रिफ़ंड किया गया |
| D-5 | refund (status) | te | "Refunded" has four forms: `admin.status.payment.refunded` "రీఫండ్ అయింది" (fe-b); `doctor.common.paymentState.REFUNDED` and `patient.dashboard.payment.refunded` "రీఫండ్ చేశారు" (fe-d, fe-p); `payment.status.refunded` "రీఫండ్ చేయబడింది" (fe-a); `patient.booking.payment.refunded` "తిరిగి చెల్లించబడింది" (fe-p / fe-d), all *(int)* | all four | రీఫండ్ చేయబడింది |
| D-6 | caretaker | te | `patient.dashboard.card.category.caretaker` *(int)* "కేర్‌టేకర్" | fe-p | సంరక్షకులు (matches `admin.category.caretaker`, `services.nav.caretakers`) |
| D-7 | admin | hi, te | `admin.workspaceLabel` (en "Administration"): "प्रशासन" / "నిర్వహణ" | fe-b | एडमिन / అడ్మిన్, so the workspace title matches the role name. Low priority |
| D-8 | prescription | hi | `clinical.editor.step.prescription` *(int)* "पर्चा और टेस्ट" | fe-d | प्रिस्क्रिप्शन और टेस्ट (matches `prescriptionDrafts.*`) |
| D-9 | report | te | `onboarding.options.staffFunction.reviewer` "నివేదిక సమీక్షకులు"; `lab.role.reviewer` says "రిపోర్ట్ సమీక్షకులు" | fe-b | రిపోర్ట్ సమీక్షకులు |
| D-10 | reschedule | hi | `patient.booking.reschedule.gateBody` *(int)* also uses "दोबारा समय"; the rest use "समय बदलना" | fe-p / fe-d | समय बदलना. Low priority |
| D-11 | verify | hi, te | `booking.status.arrivalVerified` *(int)* "पहुँचने की पुष्टि हुई" / "రాక నిర్ధారించబడింది" (confirmed), while the same arrival code is "सत्यापित" in `doctor.visit.startHint` | fe-q | पहुँच सत्यापित / రాక ధృవీకరించబడింది |

## Other wording differences seen (not in the requested term list)

- **fee:** hi uses शुल्क in 32 messages and फ़ीस in 11 (`booking`, `onboarding`, `patient`, `patientAccount`, `public`). te uses ఫీజు in 29 and రుసుము in 5: `ambulance.requests.quoteFees`, `payment.cancellation.fee`, `payment.cancellation.noFee`, `services.labDirectory.collectionFee`, `services.labDirectory.noCollectionFee`, all *(int)*. Proposed: शुल्क / ఫీజు.
- **test:** in hi, जाँच is "lab test" in 121 messages, and टेस्ट appears in 19 (`admin`, `clinical`, `common`, `patient`, `public`, `support`). जाँच also means "check". Proposed: जाँच for a lab test, matching `lab.orders.testCount`. Needs a reviewer's call.
- **Spelling is already uniform:** hi always writes चंद्रबिंदु and nukta forms (जाँच, माँग, फ़ाइल, ज़रूरी, फ़ोन, सेवाएँ, मरीज़), and te always writes రోగి, పరీక్ష, నమూనా, పిన్ కోడ్. No mixed spellings were found for these.

## Keeping it consistent

- New te/hi copy should use the canonical column. If a term is missing, add it here first.
- `tests/unit/i18n-structural-parity.test.ts` keeps keys and placeholders aligned in every namespace. Run `I18N_PARITY_DIR=<path to messages>` to check another branch's export.
- A wording lint (for example, a fail on "వైద్యులు" where English says "doctor") is not added yet. Add it once the reviewer approves this table, so that it does not lock in unreviewed choices.
