# Handoff fe-p2 (T5, fe-p working in fe2-a, branch feat/fe2-a, port 3330)

## Commits (on feat/fe2-a, not pushed)
- 305e48d fix: public header overflow at 2xl
- 789ae7c fix: R8 te/hi heading line-height, 44px hero emergency link
- 8086946 chore: browser probes and server helper in .context/

## 1. Telugu 1280px overflow
- The 12px overflow at 1280 seen on fe2-p/integration comes from that branch lacking fe-a commit 9027669 (compact xl header). On feat/fe2-a, 1280 was already clean.
- The probe found a real bug on feat/fe2-a at **2xl (>=1536px)**: the header's right cluster overflowed by 175px in te and 43px in en (`div.ml-auto` is wider than the row). Root cause: the header row is capped at `max-w-content` (78rem), but the 2xl variants (full emergency label, full language name, the "find care by PIN" link, wider padding) put back width the row never gets.
- Fix (no overflow-x band-aid):
  - The compact xl layout now applies at every desktop width.
  - The desktop PIN link was dropped; the home finder and the mobile menu keep it.
  - `LocaleSwitcher` gained a `compact` prop. The header uses it; the app shell keeps the language name.
  - The signed-in "switch workspace" and "sign out" controls are icon-only on desktop, with sr-only names and titles.
  - te has 25px free at 1280, signed in or out (estimated for signed-in).
- Probes at 390/768/1024/1279/1280/1366/1440/1535/1536/1600/1920/2560: 0 overflow in en/te/hi.
- `tests/e2e/a11y.spec.ts` sweep now also runs at 1536.

## 2. R8 usability pass (te/hi, 390/768/1280, 15 public routes)
- The audit (`.context/fep2-audit.mjs`) checks:
  - targets under 44px
  - clipped or ellipsized text, and boxes that spill out of their parent
  - line-height on multi-line text: under 1.4 for body text, under 1.25 for headings and controls
  - focus ring missing, offscreen, or under the sticky header, over the first 25 tab stops
- Found and fixed:
  - The te/hi heading line-height rule sat in `@layer base`, so `text-3xl`, `text-display` and `leading-[1.1]` utilities reset it to 1.02-1.2 (28 headings). It is now unlayered and scoped to `:lang(te)`/`:lang(hi)`: h1 1.3, h2-h4 1.4, other `.font-display` 1.5. English is unchanged.
  - The hero "not for emergencies, call 112" link was 24px tall at 768/1280. It is now `min-h-target`.
- Not issues: long-word wrapping, truncation, focus visibility. The "focus under header" hits were the fixed skip link (z-100, above the header), and "offscreen" hits came from smooth scrolling; the probe now uses reduced motion.
- Final audit: **0 issues**.
- Screens checked: hi home at 390/1280, te emergency at 390.
- Pitfall: `*/` inside a CSS comment (for example "text-*/leading-*") silently drops the next rule.

## Verification
- tsc 0, eslint 0, vitest 10 files / 231 tests pass, `npm run build` exit 0.
- public + public-nav + a11y specs:
  - After the header fix: 131 passed, 0 failed.
  - Final run (after the R8 changes, machine under load, 10.5 min): 131 passed, 3 failed by timeout/URL wait. The 3 failures were rerun with `--last-failed --workers=1`: 3 passed. These are load timeouts, not regressions.

## Commands
- Server: `pwsh .context/fep2-serve.ps1` (`-Stop` stops only its own PID); `npm run build` first with FRONTEND_ADAPTER=fixture APP_ENV=test.
- Probes: `node .context/fep2-overflow.mjs "/te,/hi"` (env WIDTHS, BASE); `node .context/fep2-audit.mjs` (env LOCALES, WIDTHS, ROUTES, TABS).

## For integration
- Merging feat/fe2-a into integration brings 9027669 and 305e48d, which remove the 12px te overflow seen on fe2-p.
