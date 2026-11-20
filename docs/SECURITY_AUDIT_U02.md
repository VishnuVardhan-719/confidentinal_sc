# SECURITY_AUDIT_U02: frontend web security audit and hardening

- **Task:** U02-sec. **Agent:** Kiro. **Worktree:** `fe-e2e`, branch `task/U01-e-e2e`, base `07d26d3` (plus the uncommitted U01-e e2e work). Not committed.
- **Scope I owned and changed:** `next.config.ts`, `tests/unit/security-headers.test.ts`, `tests/unit/security-source.test.ts`, this file and `docs/SECURITY_EDGE.md`. I did not create `src/proxy.ts`; section 1.2 explains why.
- **Method:** OWASP ASVS 4.0.3 (V1, V3, V5, V8, V10, V14) and the OWASP Top 10 (2021), applied to the code as it is today: a static, public, information-only site with no forms, no auth and no API calls.
- **Base caveat:** `surecure-frontend` is now at `6a3ca0f`. That commit changes `src/` only; it does not touch `next.config.ts`. These changes rebase without conflict.

## Summary

| Area | Status |
|---|---|
| Security headers (CSP, HSTS, XCTO, Referrer, Permissions, framing, COOP/CORP) | **Fixed** in `next.config.ts`; verified with curl against `npm start` |
| CSP strength | **Partial.** `script-src` needs `'unsafe-inline'` while pages are prerendered (S-1) |
| Secrets in client bundle | **Clean.** No service-role key, JWTs or live keys in `src/` or `.next/static` |
| XSS sinks, `target=_blank`, open redirects | **Clean.** None exist; now guarded by unit tests |
| Forms / Zod | **N/A today.** No forms exist. The `FormField` + `fieldErrors` pattern is ready; rules for future forms are in section 3 |
| Dependencies | 0 production vulnerabilities. 16 high in dev tooling, from one picomatch ReDoS with **no patched release** (S-4) |
| Lockfile | 509 entries, all with `sha512` integrity and all from `registry.npmjs.org` |
| PII / logging | **Clean.** No `console.*`, analytics or third-party scripts |
| Edge (WAF, bot, rate limit, TLS) | Checklist in `docs/SECURITY_EDGE.md`. **Cloudflare is not an approved vendor yet** (README: no unapproved vendors) |

---

## 1. HTTP security headers

### 1.1 What was added (`next.config.ts`)
- `headers()` applies one rule to `/:path*`, so every response gets the headers: HTML, RSC payloads, `/_next/static/*` assets and 404s.
- `poweredByHeader: false` removes `X-Powered-By: Next.js`.
- `buildCsp()` and `securityHeaders()` are exported pure functions so the unit tests can check them.
- If `NEXT_PUBLIC_SUPABASE_URL` is set and uses `https:`, its origin and the matching `wss://` host are added to `connect-src` automatically. Any malformed or non-https value is ignored (tested).

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see 1.2 | XSS and injection containment, framing |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | No `preload`: that is hard to undo and needs an owner decision once every subdomain is HTTPS-only |
| `X-Content-Type-Options` | `nosniff` | Stops MIME sniffing |
| `X-Frame-Options` | `DENY` | Legacy fallback for `frame-ancestors 'none'` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Health-related paths (`/categories/doctor`) never leave the site; other sites only ever see the origin |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb, serial, hid, bluetooth, motion sensors, display-capture and browsing-topics all `()` | Off until a gate needs them. GPS will need `geolocation=(self)`; a payment gateway may need `payment` |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates the browsing context. A payment popup flow may need `same-origin-allow-popups`; review at the payments gate |
| `Cross-Origin-Resource-Policy` | `same-origin` | Other sites can't embed our resources |
| `X-DNS-Prefetch-Control` | `off` | Avoids leaking hostnames through DNS prefetch |

Not set, on purpose:
- **COEP:** it would break future third-party embeds and the app doesn't need cross-origin isolation.
- **Trusted Types:** Turbopack's chunk loader assigns `script.src`, and enforcing Trusted Types would break it. Revisit when Next supports it.
- **`upgrade-insecure-requests`:** redundant when everything is `'self'` and HSTS is set.

### 1.2 CSP: the choice made and why

**Production policy:**
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data: blob:;
font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'self'; manifest-src 'self';
frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
```
In development the policy also adds `'unsafe-eval'` (React debugging), `style-src 'unsafe-inline'` (dev overlay) and `connect-src ws:` (HMR). The tests check that none of these appear in production.

**Why it isn't nonce-based yet:**
- The built HTML contains **11 inline scripts** per page (`self.__next_f.push(...)` and the Turbopack bootstrap), and none of them carry a nonce.
- The app uses `cacheComponents` (Partial Prerendering), and every public page is prerendered.
- The Next.js docs say nonces require dynamic rendering for **every** page and that "Partial Prerendering is incompatible with nonce-based CSP". The reason is that a prerendered shell has no request to take a nonce from.
- Next's experimental `sri` option hashes external chunks only. It doesn't cover the inline scripts.

| Option | Security | Cost | Decision |
|---|---|---|---|
| A. Nonce in `src/proxy.ts` + `await connection()` in pages | Strong | Drops static/PPR and CDN caching for all pages; needs `src/app` edits I don't own | Deferred to when auth lands (S-1) |
| B. Per-build hashes of inline scripts | Strong | Fragile post-build tooling; hashes change every build | Rejected |
| **C. Static CSP with `script-src 'self' 'unsafe-inline'`, no eval, everything else strict** | Medium | None | **Chosen for now** |

**What option C still blocks, verified in the browser against `npm start`:**
- An injected `<script src="https://example.com/evil.js">` was blocked (`securitypolicyviolation`: `script-src-elem https://example.com/evil.js`).
- `eval("1+1")` threw `EvalError`.
- Third-party exfiltration is blocked by `connect-src 'self'`.
- Framing is blocked by `frame-ancestors 'none'`.
- `<base>` hijacking is blocked by `base-uri 'none'`, and plugins by `object-src 'none'`.

**What it doesn't block:** an injected *inline* script. Today the site renders no user-controlled data and has no HTML sinks, so there's nothing to inject into. That changes when auth, profiles or search arrive. See S-1.

**Google Fonts, WebGL and anime.js:** `next/font/google` downloads fonts at build time and serves them from `/_next/static/media/*.woff2`. The built HTML contains no external origins, so `font-src 'self'` is enough. Three.js and anime.js are **not installed**. When the landing scene lands, Three.js needs no extra origins for bundled code. Self-hosted textures and models are covered by `img-src` and `connect-src 'self'`. Draco or Basis decoders would need `worker-src blob:` and `'wasm-unsafe-eval'`; add those only if they're actually used.

### 1.3 Evidence: real response headers

The app was built with `npm run build` (exit 0) and started with `npm start -- -p 3300`. Headers were captured with `curl.exe -s -D - -o NUL http://127.0.0.1:3300<path>` and the server was then stopped.

`GET /`:
```
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'self'; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), display-capture=(), browsing-topics=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
X-DNS-Prefetch-Control: off
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
x-nextjs-cache: HIT
x-nextjs-prerender: 1
Cache-Control: s-maxage=31536000
Content-Type: text/html; charset=utf-8
```
- **Other paths:** the same security headers came back on `/categories/doctor` (200), `/categories/nope` (200, see S-6), `/_next/static/does-not-exist.js` (404) and a real chunk, `/_next/static/chunks/310vm2bl3xxpt.js` (200, `Cache-Control: public, max-age=31536000, immutable`).
- **X-Powered-By:** absent on every response.

**The CSP doesn't break the app:**
- The U01-e e2e suite ran against the production server: **30/30 pass** at 390 and 1280 px. That includes the "no console errors" check, which would catch CSP violation reports.
- A separate probe confirmed client-side navigation still works (a window marker survived Home → How it works) and that no `securitypolicyviolation` events fired.

---

## 2. Cookies, session and CSRF (for the future Supabase auth)

There are no cookies, no auth and no mutations today. These rules apply to I01 and onward:
- **Cookies:** use `@supabase/ssr` cookie storage, not `localStorage`. Auth cookies must be `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`, with no `Domain` attribute (host-only). Use the `__Host-` prefix if the library allows it. Never set `SameSite=None`.
- **Tokens:** never pass access or refresh tokens to client components, URLs or logs. In server code, use `supabase.auth.getUser()`, which revalidates the token; `getSession()` alone doesn't. Refresh the session in `src/proxy.ts` once auth exists. That is also the natural point to switch to the nonce CSP (S-1).
- **CSRF:** Server Actions already check `Origin` against `Host`. If you're behind a proxy or CDN, set `serverActions.allowedOrigins` to exactly `surecurevisit.in`. Route handlers that mutate must check `Origin` themselves and accept only `POST/PUT/PATCH/DELETE` with a JSON content type. Never mutate on `GET`. `SameSite=Lax` is defence in depth, not the control.
- **Admin:** the role must come from the DB/RLS (AGENTS.md: no self-granted admin, no client-side service role).

## 3. Secrets, XSS, redirects and input validation

**Secrets**
- `src/` only references `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both are meant to be public, and access control relies on RLS, not on keeping the anon key secret.
- `SUPABASE_SERVICE_ROLE_KEY` is only named in a Zod schema (`src/lib/env/index.ts:10`) and is never read from client code.
- A grep of `.next/static/**/*.js` for `service_role|SERVICE_ROLE|SUPABASE_|eyJhbGci|sk_live|rzp_live` found **0 matches**.
- `.env.example` contains names only, with no values. `.gitignore` excludes `.env*` but keeps `.env.example`. `git log --all` shows no committed `.env` file.

**XSS sinks**
- `src/` has no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `target=_blank` or `javascript:` URLs.
- Every `href` is a static string or `/categories/${slug}`, where the slug comes from a fixed list in code.

**Open redirects:** there are no `redirect()`, `router.push`, `searchParams` reads or `?next=` parameters.

**Forms:** none exist. Rules for future forms:
- Validate with Zod on the **server** inside the Server Action or route handler. Client-side validation is UX only.
- Use `z.strictObject` so unknown keys are rejected, and bound every string (`.max()`).
- Store money as integer paise; never take price, role, status or paid state from the browser (AGENTS.md).
- Any `?next=` redirect must accept only same-origin relative paths: start with `/`, not `//` and not `/\`.

**New tests:** `tests/unit/security-source.test.ts` fails CI if any of these appear in `src/`:
- the HTML sinks, eval, or `javascript:` URLs listed above
- `target=_blank` without `rel="noopener noreferrer"`
- the service role referenced in a `"use client"` file
- a `NEXT_PUBLIC_*` variable not on the allow-list
- a hard-coded JWT, live Stripe/Razorpay key, AWS key or PEM private key

## 4. Dependencies

**`npm audit --omit=dev`:** 0 vulnerabilities, exit 0.

**`npm audit` (all):** 16 high, 0 critical, all in dev tooling (`vitest`, `vite`, `eslint-config-next`, `typescript-eslint`, `fast-glob`, `tinyglobby`). They all trace back to one advisory: picomatch `<=4.0.7`, ReDoS through repeated extglobs ([GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)).
- `npm view picomatch versions` shows **4.0.7 is the latest release**, so no fix exists yet.
- npm's suggested "fix" is a semver-major **downgrade** (`vitest@3.1.4`, `eslint-config-next@16.3.8`). Don't apply it.
- The risk is low: these globs are written by developers, not users, and none of this code ships to the browser. See S-4.

**Version pinning**
- Pinned exactly: `next 16.4.6`, `react`/`react-dom 19.3.0`, `tailwindcss` and `@tailwindcss/turbopack 4.3.3`, `eslint-config-next 16.4.6`.
- Caret ranges: `@supabase/ssr ^0.12.7`, `@supabase/supabase-js ^2.119.0`, `zod ^4.6.7` and the dev tools. The lockfile plus `npm ci` in CI makes installs reproducible. For a 0.x package like `@supabase/ssr`, pin it exactly (S-5).

**Lockfile:** lockfile version 3, 509 entries, 0 missing `integrity` fields, 0 `resolved` URLs outside `https://registry.npmjs.org/`. `npm ci` succeeded, so the lockfile matches `package.json`.

**Licences**
- Recent additions: `@playwright/test` and `playwright` are Apache-2.0; `@axe-core/playwright` and `axe-core` are MPL-2.0. Both are dev-only and fine to use unmodified. MPL obligations only apply to modified MPL files.
- Production tree: mostly MIT, ISC and Apache-2.0.
  - `@img/sharp-libvips-*` (LGPL-3.0-or-later) is an optional native dependency of `next/image`, dynamically linked, so LGPL is satisfied without changes.
  - `caniuse-lite` is CC-BY-4.0 (data, build-time).
  - There is no GPL or AGPL anywhere.

## 5. Edge protection

See `docs/SECURITY_EDGE.md`. The app itself has no rate limiting because it has no endpoints. Once auth, contact or OTP exist, rate limiting is needed at the edge **and** in the app (S-7).

## 6. PII and logging

- `src/` has no `console.*` calls. `error.tsx` receives `error` but neither logs nor renders it, so the user never sees stack traces or messages.
- The site has no analytics, tag managers or third-party scripts. With `connect-src 'self'`, any that are added later won't load until the CSP is changed on purpose.
- With `Referrer-Policy: strict-origin-when-cross-origin`, health-category paths never leave the site.
- Next.js build telemetry sends anonymous build metadata and no user data. To turn it off in CI, set `NEXT_TELEMETRY_DISABLED=1` (S-8).

---

## Findings for other owners

| ID | Sev | Location | Finding | Recommended fix |
|---|---|---|---|---|
| S-1 | Medium | `next.config.ts` (CSP), `src/app/**` | `script-src 'unsafe-inline'` is required while pages are prerendered (section 1.2) | When I01 (auth) lands, add `src/proxy.ts` to generate a per-request nonce plus `'strict-dynamic'` for authenticated and dynamic routes, and render those routes dynamically (`await connection()`). Keep the static CSP only for public marketing routes. Re-run the CSP probe |
| S-2 | Medium | `src/lib/env/index.ts:1-17`, `src/lib/feature-flags/index.ts:23-29` | The service-role schema and the "server-side only" flags have no compile-time guard against being imported into a client component (flags would silently read `undefined`, which means OFF, so failure is safe today) | Install `server-only` and put `import "server-only"` in `parseServerEnv` and `isEnabled` modules (split the public schema into its own module) |
| S-3 | Medium | `.github/workflows/ci.yml:10-11` | Actions are pinned to tags (`@v4`), not commit SHAs, and there's no `permissions:` block (the token gets default scopes) | Pin `actions/checkout` and `actions/setup-node` to full SHAs, add `permissions: contents: read`, and add an `npm audit --omit=dev --audit-level=high` step |
| S-4 | Low | `package-lock.json` (dev tree) | picomatch ReDoS, GHSA-fc5q-39xc-vjpf, no patched release exists | Track it. When a patched version ships, add `overrides: { "picomatch": "<fixed>" }` or update vitest/eslint. Don't apply npm's downgrade |
| S-5 | Low | `package.json` (`@supabase/ssr ^0.12.7`) | A 0.x caret range allows breaking minor versions | Pin it exactly |
| S-6 | Low | `src/app/categories/[slug]/page.tsx` | Unknown slugs return **200** in production too (`curl /categories/nope` → `200`, `Cache-Control: private, no-store`) | `export const dynamicParams = false` (also FE_REVIEW_U01 P2-1) |
| S-7 | Info (future) | auth/contact/OTP endpoints | No app-level rate limiting | Per-IP and per-account limits on OTP, login and contact; generic responses that don't reveal whether an account exists; Turnstile verified **server-side** |
| S-8 | Info | CI env | Next.js telemetry is on | Set `NEXT_TELEMETRY_DISABLED=1` in CI if the owner prefers |
| S-9 | Info | `.env.example` | It doesn't warn that `NEXT_PUBLIC_*` values ship to the browser | Add a comment line above the public keys |

## Verification commands (exit codes)

All run in `fe-e2e`. The full list is in the final report.

| Command | Exit |
|---|---|
| `npm test` (29 tests, including 16 new security tests) | 0 |
| `npm run build` | 0 |
| `npm start -- -p 3300` + curl header capture | 0 (headers above) |
| U01-e e2e suite against the production server | 30/30 pass |
| CSP enforcement probe (external script blocked, eval blocked) | pass |
| `npm audit --omit=dev` | 0 (0 vulnerabilities) |
| `npm audit` (all, including dev) | **1** (16 high, dev-only, no patched release; S-4) |
| `npm run lint` | 0 |
| `npm run typecheck` | 0 |

**Known limitation: the e2e suite fails intermittently under `next dev` (2–4 of 30 tests) on base `07d26d3`.**
- **Cause:** Next.js forwards the `/categories/[slug]` "URL data during prerendering" error to the browser console. The suite's "no console errors" check catches it, and axe sometimes runs while the page is still compiling.
- **Not caused by this task:** I reproduced the same failure rate with the **original** `next.config.ts` (2 failed in each of 2 runs).
- **Fix:** `6a3ca0f` fixes the cause in `src/` (`<Suspense>` around the params read). The flakiness should go away after rebasing.
- **Production server:** unaffected, 30/30.
