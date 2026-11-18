# PHASE 3 - connect everything into ONE workflow (your worktree already contains all merged pages)

Owner request: all pages must be linked, not separate. Flow: Landing -> Sign up / Sign in -> role-specific details -> that role's own dashboard. Landing and every page must show the related buttons.
Do NOT git commit/push. Stay inside your ownership. Run lint + typecheck + test + build, then start a dev server on a free port and click through your flow with the browser-automation skill before reporting. Keep the "Demo data — not real" badge wherever demo data shows. Use getDemoSession()/demo cookie from src/lib/demo/auth*.ts for "who is signed in".

## The workflow (source of truth)
1. Landing `/` -> header: Find care (/categories), How it works, For providers (/providers), FAQ, Sign in (/sign-in), Create account (/sign-up). Signed-in users see their Dashboard link + Sign out instead.
2. `/sign-up` -> choose account type: Patient | Doctor | Lab | Ambulance (scheduled) | Caretaker. (No admin signup.) Each type then asks ITS OWN details:
   - Patient: full name, mobile, email, date of birth, city, preferred language (English/Telugu/Hindi), optional emergency contact.
   - Doctor: full name, speciality, medical council registration no., years of experience, clinic/city, consultation modes (video/clinic), languages, fee they want to set (rupees -> stored as paise).
   - Lab: lab name, licence no., city, services (home collection / lab visit), operating hours, contact person + mobile.
   - Ambulance: operator name, registration no., number of vehicles, base city, vehicle type, scheduled non-emergency transfers only (state this plainly), contact mobile.
   - Caretaker: full name, mobile, city, years of experience, languages, optional patient link code.
   On submit (demo): set demo session for that role, store the entered details in the demo cookie/localStorage-free server state as needed, show "Account created (demo)" and redirect: patient -> /dashboard, doctor/lab/ambulance -> /provider/onboarding (then /provider), caretaker -> /caretaker.
3. `/sign-in` -> email+password shell + "Try demo as <role>" panel -> redirect to role home. `?next=` honoured. Wrong/missing session on a protected route -> redirect to /sign-in?next=...
4. Role homes: patient /dashboard; doctor/lab/ambulance /provider (content adapts to kind: appointments / sample collections / scheduled transfers); caretaker /caretaker; admin /admin. App shell nav is role-aware (only that role's links) and has Sign out.
5. Patient journey: / -> /categories -> /categories/[slug] (demo providers) -> /providers/[id] -> /book -> confirmation -> /dashboard shows the new booking. Provider accepts/declines in /provider and patient sees status change (demo state shared through the demo cookie/session helper or a small client store; keep it simple and consistent).
6. Every page has a path back: footer lists all public pages; 404/error pages link home + sign in.

## Ownership
- t28: header/footer (src/components/site-shell.tsx, nav-links.tsx), site-wide link audit (every route reachable from nav/footer, no dead links) + test that walks all hrefs; i18n of nav labels.
- t1y: landing page CTAs (src/app/page.tsx, hero): primary "Find care" + secondary "Create account", role cards "I'm a doctor / lab / ambulance operator -> /sign-up?role=...", sign-in link; /categories and /providers/[id] -> /book links.
- t27: /sign-up role picker + per-role detail forms + validation (Zod, paise for money) + role redirects; /sign-in demo panel + next=; sign-out; route-guard helper `requireDemoRole(roles)` for server components.
- t22: apply requireDemoRole to /dashboard /provider /provider/onboarding /caretaker /admin /account /book; role-aware app shell nav; new /caretaker dashboard (linked patients list from demo data, read-only schedule); provider dashboard adapting to kind; booking shows up in patient dashboard.
- t23: e2e spec for the whole workflow for every role + axe per route; fix-or-report any dead link; update docs/SECURITY_AUDIT_U02.md for demo cookie (httpOnly, sameSite, signed or clearly non-secret, demo-mode-only).
