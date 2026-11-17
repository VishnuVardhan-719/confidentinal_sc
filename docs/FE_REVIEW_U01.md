# FE_REVIEW_U01: adversarial review of the public frontend

- **Reviewer:** Kiro (read-only review; no `src/` edits, nothing committed)
- **Target:** `C:\Users\Yashwanth\surecure-frontend\src`, branch `task/U01-a-app-shell`, commit **`6a3ca0f`**
- **Snapshot note:** the review started on `1aebc29`. The owner committed `6a3ca0f` while it was running. The runtime checks used a snapshot that is byte-identical to `6a3ca0f` `src/` (every file hash checked). All line numbers refer to `6a3ca0f`. A finding marked *(6a3ca0f)* was introduced in that commit.

## How the findings were checked

| Check | What was run | Result |
|---|---|---|
| U01-e e2e suite (one h1, landmarks, skip link, no horizontal scroll, no console errors, axe at serious/critical) | Temp snapshot of `6a3ca0f`, `next dev`, Chromium at 390 and 1280 px | 30/30 pass |
| Layout at 320 and 360 px, 24 px target scan, full-page screenshots | `fe-e2e` worktree (`07d26d3`; layout CSS is the same as `6a3ca0f` except `.track li { align-content: start }`) | No overflow on any page |
| Reflow: text spacing (WCAG 1.4.12) at 320 px; 200% root font at 640 px | Same | No overflow |
| Reduced motion | Computed styles with `reducedMotion: reduce` and `no-preference` | See R-1 |
| Telugu/Hindi rendering | Sample strings injected into the h1 and lead paragraph; actual fonts read through CDP `CSS.getPlatformFontsForNode`; screenshots | See P1-2 and P2-6 |
| HTTP status of unknown routes | `07d26d3` and `6a3ca0f`, `next dev` | See P2-1 |
| Palette contrast | WCAG relative-luminance formula applied to the `globals.css` tokens | See P1-1 |
| Impeccable design detector (`detect --json src`) | Static scan | `[]`, no findings |

**Not tested:** Firefox, WebKit, real Android or iOS devices, a production build (`next start`) and Lighthouse. Fonts were resolved on Windows only.

## Scores

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Default input border is 1.51:1 (fails 1.4.11); Indic headings use line-height 1.02 |
| 2 | Performance | 3 | Two Google font families, including Newsreader italic plus the opsz axis; acceptable for now |
| 3 | Theming | 2 | Spacing tokens are defined and never used; hex values bypass tokens in 4 components |
| 4 | Responsive | 3 | Clean at 320/360; emergency `tel:112` target is 20×20 px; hover states stick on touch |
| 5 | Implementation integrity | 3 | Coherent, product-specific visual system; drift is small and fixable |
| | **Total** | **14/20** | **Good** |

**Integrity verdict: pass.** This is not generic AI-SaaS output. The site pairs Newsreader (an editorial serif) with Atkinson Hyperlegible Next for body text, uses a hairline service index instead of cloned cards (`globals.css:144-158`), a forest band with a numbered track, and the warm paper palette from DESIGN.md. There are no gradients, glassmorphism, emoji icons or invented metrics. The weaknesses are drift inside the system, mainly spacing and type scale, not the overall direction.

---

## Findings by severity

### P1: fix before release, or before the ticket that first uses the affected code

**P1-1. Default input border fails non-text contrast (WCAG 1.4.11)**
- **Location:** `src/components/ui/input.tsx:15` uses `border-[var(--line)]`; the token is set at `src/app/globals.css:15` (`--line: #c5d6d1`).
- **Evidence:** `#c5d6d1` measures 1.51:1 on the white input background. The rule requires 3:1. `--line-strong` (`#8fa9a3`) only reaches 2.36:1.
- **Impact:** low-vision users can't see where the field is. No form ships yet, so this lands with the first form ticket.
- **Fix:** add a separate control-border token of at least 3:1. For example, `#768d87` measures 3.54:1 on white and 3.33:1 on paper. Keep `--line` for hairlines.

**P1-2. Heading line-height and negative letter-spacing break Telugu and Hindi text** (blocks the i18n ticket)
- **Location:** `src/app/globals.css:60-66`. Headings use `line-height: 1.1`, the h1 uses `1.02`, and letter-spacing is `-.03em`, `-.02em` and `-.015em`. The same pattern appears in `.brand` (`:85`) and `.service-name` (`:149`).
- **Evidence:** at 360 px, a Telugu h1 wraps to 4 lines with 40 px line boxes at a 40 px font size. Its letter-spacing computes to `-1.2px`, and that negative tracking also applies to Nirmala UI. In the screenshot, vowel signs above the letters reach past the top of the line box, and stacked consonants below the letters touch the next line. Devanagari top marks (`ॉ`, `ँ`) also overflow the line box.
- **Impact:** text collides between lines and glyphs get clipped inside any `overflow: hidden` container. Negative tracking also pulls joined letter clusters apart.
- **Fix:** add `:lang(te), :lang(hi) { h1, h2, h3, .brand, .service-name { line-height: 1.35–1.45; letter-spacing: 0; } }` and set `lang` per locale (see P2-6). Test long Telugu compound words at 320 px, as `docs/specs/DESIGN_ANIMATION_I18N.md:36` requires.

### P2: fix in the next pass

**P2-1. Unknown category slugs return HTTP 200 with "Page not found" (soft 404)**
- **Location:** `src/app/categories/[slug]/page.tsx`. `notFound()` (`:65`) sits inside `<Suspense>` in `CategoryContent` *(6a3ca0f)*. The earlier version without Suspense behaves the same way.
- **Evidence:** in `next dev`, `/categories/nope` and `/categories/ambulance` return **200** plus `<meta name="robots" content="noindex">`. `/nope` correctly returns 404. On `6a3ca0f`, the first request to `/categories/nope` once returned **500** with `SyntaxError: Unexpected end of JSON input`. That may be a dev compile race, but it was not confirmed under `next start`.
- **Impact:** wrong status codes for crawlers and monitoring. `/categories/ambulance` is a likely hand-typed URL.
- **Fix:** add `export const dynamicParams = false` so unknown slugs return 404 at routing. Optionally redirect `/categories/ambulance` to `/categories/scheduled-ambulance`. Add a status assertion to `tests/e2e`.

**P2-2. Category summaries read as if booking is open when it isn't**
- **Location:** `src/app/categories/data.ts:14, 33, 52, 71` ("Arrange a consultation with a doctor you choose.", "Request diagnostic tests…", "Plan non-emergency patient transport…", "Request non-clinical help…"). These summaries also become the page `<meta description>` at `[slug]/page.tsx:18` and the index text at `src/components/service-index.tsx:23`.
- **Related:** `src/app/how-it-works/steps.ts:9` ("you see it before you send a request") and `data.ts:27, 46, 79` ("Doctors set their own fees and accept requests themselves.") describe a provider network that doesn't exist yet, in the present tense. The How it works page frames them with "once booking opens". The home band (`src/app/page.tsx:61-74`) does not.
- **Impact:** search snippets and link previews drop the "booking is not open" context. They then claim live availability, which AGENTS.md forbids (no fake availability).
- **Fix:** write the meta descriptions in the future tense, e.g. "Planned: consultations with a doctor you choose. Booking is not open yet." Add "once booking opens" to the home band intro.

**P2-3. Emergency `tel:112` link has a 20×20 px tap target on mobile**
- **Location:** `src/components/site-shell.tsx:48` (footer) and `src/app/page.tsx:40` (hero status panel).
- **Evidence:** at 360 px the links measure 20×20 and 25×22 CSS px. They pass WCAG 2.5.8 only under the inline-text exception.
- **Impact:** this is the most safety-relevant tap on the site, and it's the hardest to hit on a small Android phone.
- **Fix:** in the status panel and footer, render a separate "Call 112" link with a 44 px minimum height. Keep the inline mention in the sentence.

**P2-4. Spacing scale is defined but never used**
- **Location:** `src/app/globals.css:18-24` defines `--space-1` to `--space-12`. There are **0** uses in `src/`.
- **Evidence:** the CSS uses 16 different raw rem values. Several are off any scale: `1.75rem` (`:123`, `:145`), `2.25rem` (`:167`, `:191`), `4.5rem` (`:161`), `.3rem` (`:172`) and `.625rem` (`:112`, `:155`). Pages add more Tailwind spacing (`mt-8`, `mt-12`, `mt-16`, `p-5`, `p-8`). `max-w-[46rem]` repeats `.page-header`'s 46rem in three places: `how-it-works/page.tsx:25`, `error.tsx:11` and `not-found.tsx:15`.
- **Fix:** map the existing tokens into `@theme` (`--spacing-*`) and replace the raw values. Add a `.measure` utility for the 46rem width.

**P2-5. No type scale: h2 renders at five different sizes**
- **Location (`globals.css` unless noted):** section h2 `clamp(1.875–2.75rem)` (`:65`), prose and steps h2 at h3 size (`:109`, `:179`), `.service-name` h2 on `/categories` `clamp(1.625–2.125rem)` (`:149`), `.status-title` h2 at `.9375rem` (`:132`), and Empty/Error state h2 at `text-xl` (`src/components/ui/states.tsx`).
- **Evidence:** besides those, there are about 12 more literal font sizes (`:85`, `:100`, `:106`, `:170`, `:172`, `:178`, and others).
- **Impact:** the hierarchy holds today because the serif/sans contrast carries it. Each new page will add more sizes.
- **Fix:** define 6–7 type tokens (display, h1, h2, h3, lead, body, small) and point every heading class at them.

**P2-6. Font fallback chain *(regression in 6a3ca0f)* and hard-coded `lang`**
- **Location:** `src/app/layout.tsx:14-15` adds `fallback: ["Atkinson Metric Fallback", "Arial", "sans-serif"]`, and `globals.css:54` (body stack) follows it with the Indic families.
- **Evidence:** the computed body stack is now `"Atkinson Hyperlegible Next", "Atkinson Metric Fallback", Arial, sans-serif, "Noto Sans Telugu", "Noto Sans Devanagari", "Nirmala UI", sans-serif`. The generic `sans-serif` now comes **before** the Indic families, so on engines that resolve the generic first, those explicit preferences are never reached. On Windows, Chromium still drew Telugu and Hindi in Nirmala UI (CDP: 13–16 glyphs from Nirmala UI). Android and iOS were not verified.
- **Second issue:** the metric fallback uses `src: local("Arial")` (`globals.css:31-38`). Stock Android usually has no font named Arial, so the layout-shift fix may not work on the platform the spec targets.
- **Also:** `<html lang="en">` is hard-coded (`layout.tsx:38`), and P1-2's `:lang()` fix depends on it changing per locale.
- **Fix:** drop `"sans-serif"` from the next/font `fallback` array so the stack continues into the Indic families. Add `local("Roboto")` as a second `src` for the metric fallback, or accept the shift on Android. Set `lang` from the locale when i18n lands.

**P2-7. Service index loses its focus ring in browsers without `:has()`**
- **Location:** `globals.css:148` puts the outline on the parent using `:has(.service-link:focus-visible)`, and `:151` removes the outline from the link (`.service-link:focus-visible { outline: none }`).
- **Impact:** browsers without `:has()` (Chrome before 105, Firefox before 121, Safari before 15.4) show no focus indicator at all, which fails WCAG 2.4.7. The spec asks for testing on older devices (`DESIGN_ANIMATION_I18N.md:42`).
- **Fix:** wrap the `outline: none` rule in `@supports selector(:has(*))`.

**P2-8. Interactive states are missing pressed states and stick on touch**
- **Location:** `.site-nav a` (`globals.css:88-90`), `.service-item` (`:145-158`), `.breadcrumb a`, `.text-link`.
- **Evidence:** these have default, hover and focus states, but no active/pressed state. Only `Button` and `ButtonLink` have one (`active:translate-y-px`). The `.service-item:hover` mist background and filled arrow stay on after a tap on touch screens.
- **Fix:** wrap the hover rules in `@media (hover: hover)` and add an `:active` state, e.g. a darker mist background on the service item and the forest color on nav links.

**P2-9. `FormField` passes an `invalid` prop to native elements**
- **Location:** `src/components/ui/form-field.tsx:32`, while the doc comment at `:19` says children can be "Input, select, textarea".
- **Impact:** on a native `<select>` or `<textarea>`, React writes an unknown `invalid` DOM attribute and logs a warning. The element also gets no `aria-invalid`, so screen readers aren't told the field is in error. Nothing breaks yet because no form uses it.
- **Fix:** pass `"aria-invalid": Boolean(error) || undefined` instead of `invalid`, or restrict `children` to `Input`.

### P3: polish

- **R-1. Reduced-motion spinner:** `globals.css:207-210` turns off all animation and transitions under reduced motion. This is verified correct: the hero underline shows its final state (`background-size: 100%`), transitions drop to 0s, and the hover arrow doesn't move. The side effect is that `Loading` (`states.tsx:9`) and the `Button` loading spinner (`button.tsx:47`) freeze as an incomplete ring. That ring is now the category Suspense fallback *(6a3ca0f)*. Use a static or pulsing indicator instead.
- **Hard-coded colors:** `button.tsx:17` uses `hover:bg-[#0b4c47]` instead of `var(--forest-deep)`. Since `ButtonLink` now shares `Button`'s classes *(6a3ca0f)*, the link's hover also lost its token. Other hard-coded values: `form-field.tsx:45` (`#40585b`, which equals `--ink-soft`), `input.tsx:11` (placeholder `#5d6f72`) and `states.tsx:28` (`bg-[#fbf4ea]`) *(6a3ca0f)*. `@theme` already defines `forest` and `mist`, but components use `bg-[var(--forest)]` instead of `bg-forest`.
- **Input layout shift:** the invalid state changes the border from 1 px to 2 px (`input.tsx:15`), which moves the content by 1 px. Use a fixed 2 px border, or an inset `box-shadow`.
- **Hero copy:** "arranged with clarity" (`page.tsx:14`) is vague. A concrete promise such as "You pick the provider; the provider confirms." would say more. The copy owner should decide.
- **Breadcrumb separator:** some screen readers read the CSS `"/"` (`globals.css:116`). Use `content: "/" / ""`.

---

## Fake-claims audit (AGENTS.md invariants): no violations

I searched all of `src/` for ratings, reviews, prices, coverage or location, availability, ETAs, "verified" badges, counts and emergency capability. **Nothing found.**
- No prices, ratings, testimonials, provider names, PIN or city coverage, ETAs or verification badges.
- The site says booking is not open in five places: `page.tsx:35`, the footer `site-shell.tsx:42-43`, `categories/page.tsx:16`, the category page EmptyState and `how-it-works/page.tsx:26-27`.
- Emergency messaging is consistent: "call 112… not an emergency service" appears in the hero, the footer, How it works and the scheduled ambulance notes (`data.ts:60`). The ambulance category exists only as "Scheduled ambulance".
- The only weak point is the present-tense availability wording in P2-2.

## What's working well
- The skip link, a focusable `main`, a single h1, labelled navs with `aria-current`, and correct breadcrumb markup. axe found no serious or critical violations at 390 and 1280 px.
- No horizontal overflow at 320 and 360 px, or under the 1.4.12 text-spacing and 200% text checks.
- Navigation and breadcrumb targets are at least 44 px, and the service rows are fully clickable.
- Text contrast on every token pair I checked is 4.8:1 or better (`--ink-soft` on paper 7.15, `--on-forest-soft` on forest 5.58, `--warning` on mist 4.82). The focus ring on paper is 4.24.
- Commit `6a3ca0f` fixes the earlier `params` dev warning (with `<Suspense>`), unify `ButtonLink` with `Button`, and replace the side-stripe error box.

## Suggested order of work
1. **P1-1, P1-2:** add a control-border token and the `:lang()` heading overrides (`$impeccable typeset`, `$impeccable harden`).
2. **P2-1:** add `dynamicParams = false` and a status test (owner: page code; the e2e test belongs to U01-e).
3. **P2-2, P2-3:** fix the future-tense copy and add a 44 px "Call 112" link (`$impeccable clarify`, `$impeccable adapt`).
4. **P2-4, P2-5:** wire the spacing and type tokens through `@theme` (`$impeccable layout`, `$impeccable typeset`).
5. **P2-6 to P2-9:** fix the font stack order, add the `:has()` guard, add touch/pressed states and fix the `FormField` prop.
6. Finish with a `$impeccable polish` pass.
