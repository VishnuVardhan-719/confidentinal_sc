# SECURITY_EDGE: edge protection checklist (Cloudflare in front of Vercel or other hosting)

> **Status: recommendation only.** Cloudflare is **not an approved vendor** yet. README: "No unapproved stack changes or vendors". Vercel itself is subject to client ownership and approval. The owner and client must approve the vendor, the account ownership (it should be the client's account, not an agent's or a contributor's) and the cost before anything here is set up. Every change below is made in the client's dashboard by the person who controls release operations.
>
> Owner: release operations. Written for task U02-sec. Pair it with `docs/SECURITY_AUDIT_U02.md`.

## 0. Topology decision (decide first)

- [ ] **Choose one.**
  - **(a)** Cloudflare DNS-only, with Vercel's own edge and firewall. This is the simplest option and avoids double CDN caching.
  - **(b)** The Cloudflare proxy (orange cloud) in front of Vercel. Vercel [documents this as supported but not recommended](https://vercel.com/docs/integrations/external-platforms/cloudflare). It adds latency and can break Vercel's caching and features unless it's configured carefully.
  - The rest of this list assumes **(b)**. Under (a), apply the equivalent controls in Vercel Firewall.
- [ ] **If you choose (b), lock the origin.** Only Cloudflare should be able to reach the origin. Use Vercel Deployment Protection, or a secret request header that Cloudflare sets and the app checks. Otherwise attackers can skip the WAF by going straight to the `*.vercel.app` URL.
- [ ] **Preview deployments:** `*.vercel.app` previews must require Vercel Authentication, and no production secrets may be attached to them.

## 1. DNS and TLS

- [ ] **DNSSEC:** turn it on in Cloudflare, then add the DS record at the `.in` registrar. Afterwards, check that `dig +dnssec surecurevisit.in` returns the `ad` flag.
- [ ] **CAA records:** allow only the CAs actually in use (Cloudflare's and Vercel's, e.g. `letsencrypt.org`, `pki.goog`), and add an `iodef` mailto address.
- [ ] **SSL/TLS mode: Full (strict).** Never use Flexible: it sends traffic from Cloudflare to the origin unencrypted, which is not acceptable for health data.
- [ ] **Minimum TLS version 1.2.** Turn TLS 1.3 on.
- [ ] **Always Use HTTPS:** on. **Automatic HTTPS Rewrites:** on.
- [ ] **HSTS:** the app already sends `max-age=31536000; includeSubDomains`. Don't set a conflicting HSTS policy at Cloudflare.
  - **Preload** is a separate owner decision: it is hard to undo, and every subdomain must be HTTPS forever.
- [ ] **Email security:** add SPF, DKIM and DMARC (`p=quarantine`, moving to `reject` later) once an email vendor is chosen. Add `v=spf1 -all` on hostnames that never send mail.

## 2. WAF

- [ ] **Turn on the managed rulesets:**
  - **Cloudflare Managed Ruleset.**
  - **OWASP Core Ruleset:** start in *log* mode. Tune for a week, then block at paranoia level 1–2.
- [ ] **Custom rules:**
  - [ ] Block or challenge requests for paths that don't exist in this app: `/wp-admin*`, `/wp-login.php`, `/.env*`, `/.git*`, `/xmlrpc.php`, `/phpmyadmin*`, `/server-status`.
  - [ ] Allow only the methods the app uses (`GET`, `HEAD`, `POST`, plus `OPTIONS` if CORS is ever added); block everything else.
  - [ ] Once the app has a known API surface, add body-size limits on POST routes (for example 64 KB for JSON, and larger only on upload routes).
  - [ ] **Geo restriction:** don't block by geography by default. Real patients travel and use VPNs. Consider a challenge for non-IN traffic **only** on admin and provider-onboarding routes, and only if the owner agrees.
- [ ] **Leaked credentials detection:** turn it on once login exists.
- [ ] **Admin routes:** put `/admin*` behind Cloudflare Access (Zero Trust) **in addition to** app-level role checks. Access is extra protection; it doesn't replace server and RLS authorization.

## 3. Bots

- [ ] **Bot Fight Mode** (free plan), or **Super Bot Fight Mode** (Pro and up):
  - challenge "definitely automated" traffic
  - allow verified bots (search engines)
  - check that it doesn't block the payment gateway's **webhook** requests (see section 4)
- [ ] **AI crawlers:** block them on all routes, or only on authenticated ones. Owner decision; public marketing pages can stay crawlable.
- [ ] **Turnstile** on every public form (contact, provider registration, OTP request, sign-up, password reset):
  - the widget runs on the client
  - the token must be **verified on the server** (`siteverify`) before any side effect
  - put the Turnstile secret in server env only, never in a `NEXT_PUBLIC_*` variable
  - CSP impact: add `https://challenges.cloudflare.com` to `script-src` and `frame-src` **only** on routes that render the widget

## 4. Rate limiting (edge rules; the app must also limit, see audit S-7)

| Route / action | Key | Suggested limit | Action |
|---|---|---|---|
| OTP request (SMS/email) | IP + phone/email | 3 / 10 min, 10 / day | Block 1 h. SMS costs real money |
| OTP verify / login | IP + account | 5 / 10 min | Block 15 min; generic error |
| Sign-up, password reset | IP | 5 / hour | Managed challenge |
| Contact / provider registration form | IP | 5 / hour | Managed challenge, plus Turnstile |
| Booking create / mutate API | Session/user + IP | 30 / min | Block 1 min. Idempotency keys still required in the app |
| Search / discovery API | IP | 120 / min | Challenge |
| Payment **webhook** endpoint | Gateway IP allow-list | Don't rate-limit legitimate gateway IPs; skip bot rules | Signature + amount + currency verification and de-duplication in the app (AGENTS.md) |
| Everything else | IP | 600 / min | Log first, then challenge |

- [ ] Return generic responses so an attacker can't tell whether an account exists. Log only counts, never the identifier.

## 5. Cache rules

- [ ] **Cache aggressively:** `/_next/static/*` is immutable (the app already sends `public, max-age=31536000, immutable`). Set an edge TTL that respects the origin.
- [ ] **Never cache at the edge:**
  - authenticated HTML
  - anything that sends a `Set-Cookie` header, or receives the Supabase auth cookies
  - `/api/*`
  - Server Action POSTs
  - RSC requests (`RSC: 1` header or `_rsc` query parameter): bypass, or Cloudflare may serve the wrong payload
- [ ] **Public marketing pages:** respect the origin's `Cache-Control`; don't use "Cache Everything" across the site. Next varies on `rsc` and router headers (`Vary` in the audit evidence), and Cloudflare doesn't vary on custom headers, so blanket caching can mix HTML and RSC responses.
- [ ] **Private storage:** never cache Supabase Storage signed URLs. Clinical and verification files are private, short-lived, and authorized on every issue.
- [ ] **Deploys:** purge the cache on deploy (Vercel deploy hook → Cloudflare purge API, using a token scoped to cache purge only).

## 6. Headers at the edge

- [ ] **Don't duplicate or override the app's security headers.** The app is the source of truth (`next.config.ts`). Turn off Cloudflare "Security Header" transforms that would conflict.
- [ ] **Remove Cloudflare features that inject scripts**, because the CSP would block them anyway:
  - Rocket Loader
  - Email Address Obfuscation
  - Cloudflare Web Analytics auto-inject
  - Zaraz
  - Mirage
  - Automatic Platform Optimization
- [ ] **CSP reporting:** once a reporting endpoint is approved, add a `report-to` directive and the `Reporting-Endpoints` header.

## 7. Logging, privacy and access

- [ ] Cloudflare logs hold IP addresses, URLs and user agents. Under DPDP Act 2023 these are personal data.
  - Record Cloudflare as a processor in `docs/PRIVACY_AND_OPERATIONS_GATES.md` once it is approved.
  - Set the shortest log retention that operations allow.
- [ ] **Health information in URLs:** URLs must never contain patient names, phone numbers, conditions or booking contents. Use opaque IDs only, because URLs appear in edge logs.
- [ ] **Account access:**
  - 2FA enforced on the Cloudflare account
  - least-privilege API tokens (scoped to one zone and the needed permissions only)
  - no Global API Key in use
  - audit-log review monthly

## 8. Verification after go-live

- [ ] `curl -sI https://surecurevisit.in/` shows every header from `docs/SECURITY_AUDIT_U02.md` §1.3, once each.
- [ ] `curl -sI http://surecurevisit.in/` returns 301 to https.
- [ ] Scan results:
  - SSL Labs grade A or better
  - `securityheaders.com`: A
  - Mozilla Observatory: B+ or better (the `'unsafe-inline'` in S-1 costs points until the nonce CSP)
- [ ] The direct `*.vercel.app` production URL doesn't serve production content without the edge, if you chose (b).
- [ ] The rate-limit rules trigger in a staging test with synthetic accounts only.
- [ ] The payment gateway's test-mode webhooks pass through the WAF and bot rules.
