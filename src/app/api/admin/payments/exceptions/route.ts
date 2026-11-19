import { paymentRoute } from "@/lib/payments/http";

export const GET = paymentRoute("list_payment_exceptions");

// The feature gate rejects before any request API is read, so without this the
// gate-off 404 would be prerendered at build time and served after enabling.
export const dynamic = "force-dynamic";
