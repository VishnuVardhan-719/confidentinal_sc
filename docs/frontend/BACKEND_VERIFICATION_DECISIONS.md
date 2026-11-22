# Backend verification and invoice decisions (delegated to Claude by the owner, 2026-11-23)

Status: DECIDED for planning. Nothing is purchased, signed up for or built yet. Backend work starts only when the owner says "start backend". Provider capabilities and prices must be re-verified at that time.

## Supabase plan
- Development and staging: Free tier, synthetic data only.
- Production: Supabase Pro, taken just before real users or real patient data. Decide on the point-in-time recovery add-on at that point.

## Phone OTP (patients, providers)
- Supabase Auth phone OTP. SMS delivery through MSG91 (India, DLT support) via Supabase's Send SMS auth hook. Fallback: Twilio Verify.
- Start DLT registration (sender ID and OTP template) early; it takes days to weeks.
- Development: Supabase test phone numbers with fixed OTPs, no SMS cost.
- Rate limit OTP sends per phone and per IP. OTP expires in 10 minutes or less.

## Email verification and auth emails
- Supabase Auth email confirmation and password reset, sent through Resend SMTP on a verified sending domain (SPF, DKIM, DMARC).
- Supabase's default sender is not used in production (rate-limited).

## Provider, lab, ambulance and caretaker verification
- Admin review queue (already built in the frontend). Documents stay in private Storage; admins approve or reject with a reason. No listing goes public before approval.

## Order invoices
- Generated server-side as a PDF when a booking or order reaches its invoiceable state, stored in a private Storage bucket and served by short-lived signed URL.
- Sequential invoice numbers from a database sequence per financial year. Amounts in integer paise, timestamps in UTC, built from the immutable price snapshot.
- `InvoiceLink` appears only once an invoice exists. No fake or placeholder invoices.
- Open for the owner's finance advisor or CA: legal issuer (platform or provider) and GST treatment. Invoice issuing stays behind a feature flag until that is settled.
