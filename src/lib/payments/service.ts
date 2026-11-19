import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityError } from "@/lib/auth/identity";
import { paiseSchema, rpcSchemas, type PaymentArgs, type PaymentCommand } from "@/lib/validation/payments";

export type PaymentState = "not_initiated" | "due" | "partially_paid" | "paid" | "disputed" | "voided";
export interface PaymentSummary {
  state: PaymentState;
  amountPaise: string;
  confirmedPaise: string;
  currency: "INR";
  version: number;
  noCharge: boolean;
  reviewPending: boolean;
  claims?: Record<string, unknown>[];
}
export interface IntakeStatus { id: string; status: "pending" | "converted" | "dismissed"; reportedAt: string }
type Results = {
  report_collection: string;
  report_collection_exception: string;
  supersede_collection: string;
  review_collection_intake: null;
  void_collection: null;
  reconcile_collection: null;
  dispute_payment: null;
  resolve_dispute: null;
  override_payment: null;
  get_payment_summary: PaymentSummary;
  get_collection_intake_status: IntakeStatus;
  list_provider_payments: (PaymentSummary & { public_ref: string })[];
  list_payment_queue: Record<string, unknown>[];
  list_payment_exceptions: Record<string, unknown>[];
};

function databaseError(code: string, message: string): IdentityError {
  if (code === "55000" && message === "feature_unavailable") return new IdentityError(404, "feature_unavailable");
  if (["28000", "28P01", "PGRST301", "PGRST302", "PGRST303"].includes(code)) return new IdentityError(401, "unauthenticated");
  // Do not reveal whether a scoped resource exists, including capability denials.
  if (["42501", "P0002"].includes(code)) return new IdentityError(404, "not_found");
  if (["40001", "40P01", "23P01", "23505", "55000"].includes(code) || (code === "22023" && message === "over_collection")) return new IdentityError(409, "conflict");
  if (["22023", "22003", "22007", "22008", "23503", "23514"].includes(code)) return new IdentityError(422, "invalid_input");
  if (code === "53300") return new IdentityError(429, "rate_limited");
  return new IdentityError(503, "payments_unavailable");
}

/** Preserve string paise at the API edge, including bigint from future transports.
 * Refuse unsafe numeric results rather than silently returning rounded money. */
function apiValue(value: unknown, key = ""): unknown {
  if (/(?:Paise|_paise)$/.test(key) && value !== null) {
    if (typeof value === "number" && !Number.isSafeInteger(value)) throw new IdentityError(503, "payments_unavailable");
    if (!["string", "bigint", "number"].includes(typeof value)) throw new IdentityError(503, "payments_unavailable");
    const amount = String(value);
    if (!paiseSchema.safeParse(amount).success) throw new IdentityError(503, "payments_unavailable");
    return amount;
  }
  if (Array.isArray(value)) return value.map(item => apiValue(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, apiValue(v, k)]));
  if (typeof value === "bigint") return value.toString();
  return value;
}

/** User JWT only. Authorization, capabilities, AAL2, version/amount checks and
 * durable keyed replay are enforced by the future SQL RPC, never inferred here. */
export async function paymentCommand<C extends PaymentCommand>(
  db: Pick<SupabaseClient, "rpc">,
  name: C,
  args: PaymentArgs<C>,
): Promise<Results[C]> {
  const validated = rpcSchemas[name].safeParse(args);
  if (!validated.success) throw new IdentityError(422, "invalid_input");
  try {
    const { data, error } = await db.rpc(name, validated.data);
    if (error) throw databaseError(error.code, error.message);
    // Never retry conflicts: a fresh version or a new user decision is required.
    return apiValue(data) as Results[C];
  } catch (error) {
    if (error instanceof IdentityError) throw error;
    throw new IdentityError(503, "payments_unavailable");
  }
}
