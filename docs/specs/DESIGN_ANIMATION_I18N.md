# Design, Animation and Internationalization Spec

## Brand direction and anti-AI-slop checklist

Complete rebrand. Brand name: **SureCure Visit**. Visual direction: premium Indian healthcare editorial, calm, elegant, high readability, useful photography, authentic stories. Proposed palette is deep teal / warm ivory / graphite with purposeful accents, **pending client approval**. No fake provider metrics, fabricated stories or stock-photo promises. Distinctive typographic system and generous whitespace, not default-card-everywhere.

Do **not** ship: giant purple gradients, meaningless animated blobs, identical icon cards on every page, illegible low-contrast text, animation during emergency or checkout, faux 'AI powered' trust indicators, inaccessible hover-only controls, excessive 3D/GPU work on mobile.

## Recommended libraries and why

- **Three.js + React Three Fiber:** exactly one custom narrative 3D hero/background *if performance allows*, dynamic-loaded client-side, static fallback poster, disable motion for `prefers-reduced-motion`, mobile performance budgets.
- **Anime.js:** deliberate page reveals/illustrations/section choreography and SVG transitions; ensure library identity (user said 'animate.js', previously agreed as Anime.js) and pinned version licensing.
- **21st.dev:** handpicked React component patterns only, adapt code to design tokens and accessibility; review licenses/third-party dependencies.
- **shadcn/ui:** base accessible input/dialog/table components, **heavily customized**; no default template aesthetics.
- **CSS:** ordinary hover/focus/expand transitions; avoid adding yet another global animation engine.

| Surface | Animation policy |
|---|---|
| Marketing hero / stories | Showcase premium motion if meaningful, fully optional |
| Service search/cards | Soft reveals and focused hover/focus |
| Signup/onboarding | Progress and confirmations only |
| Doctor consultation / clinical fields | Minimal; instant, accessible and distraction-free |
| Payment / OTP | Minimal; prevent delayed input feedback |
| Ambulance emergency guidance | No decorative animation |
| Dashboard graphs | Subtle, reduced-motion fallback |

## Content and IA

Landing `/` → hero and availability/PIN selector → four service areas → How it works → real verification process → trusted published stories/experience (consent) → Family memberships (only approved claims) → Provider registration → FAQ/support/footer. Separate About Us, Our Story, Stories, FAQs, Terms/Privacy/Refund policy; client-supplied legal entity needed before publication. Nav includes service exploration and signup; guest can browse before registering; authenticated role users go to role dashboard or unfinished onboarding.

## Internationalization

- **Locales:** `en`, `te`, `hi`. Default `en`. Suggested URLs `/en/...`, `/te/...`, `/hi/...` with canonical/hreflang considerations; admin/doctor may choose remembered preference.
- **Use next-intl** or equivalent with JSON dictionaries; no runtime Ollama translation for safety-critical UI. Language choice in global header and account settings, preserved across sessions/device when signed in.
- Translate all essential labels, validation, payment status, booking/OTP, notifications/templates where supported, help, legal notices and accessibility content. Use real reviewers for healthcare terms, consent and payment obligations.
- Telugu and Devanagari font fallback; test wrapping, long words, error text, numerals and PDFs. Database monetary values, OTP digits and reference IDs remain canonical, not translated.
- Preserve clinician-authored note/prescription original language; do not machine-translate medicine dosages or legal terms without careful review.
- Test locale switch mid-signup without losing form state or sensitive data.

## Accessibility and QA criteria

Touch targets, keyboard navigation, visible focus ring, WCAG-oriented contrast, proper form labels/errors, no mandatory animation, low-bandwidth static fallback, lazy-loaded imagery/WebGL, Lighthouse/Core Web Vitals measured after integration. Patient-facing flows tested on small Android viewport and older devices; doctor consultation forms reliable under poor connections.
