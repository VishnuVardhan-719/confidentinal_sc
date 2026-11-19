import { z } from "zod";

export const paiseSchema = z.string().regex(/^(0|[1-9][0-9]{0,14})$/);
// Pipe prevents BigInt conversion until the decimal format check has passed.
const positivePaise = paiseSchema.pipe(z.string().refine(value => BigInt(value) > BigInt(0)));
const uuid = z.uuid();
const version = z.int().min(1).max(2_147_483_647);
const method = z.enum(["cash", "upi_direct"]);
// Shared collection reasons from design section 4.1. Resolution/intake reasons
// reuse this closed list pending confirmation by the SQL author (see handoff).
export const paymentReasonSchema = z.enum(["amount_mismatch", "not_received", "duplicate", "wrong_payee", "correction", "other"]);
const disputeReason = z.enum(["not_received_service", "amount_wrong", "already_paid", "not_paid_but_claimed", "other"]);
const reference = z.string().regex(/^[0-9]{12}$/).nullable().default(null);
const referenceValid = (kind: string, value: string | null) => kind === "cash" ? value === null : value !== null;

const claimFields = { amountPaise: positivePaise, method, reference };
export const collectionSchema = z.strictObject(claimFields).refine(v => referenceValid(v.method, v.reference));
export const decisionSchema = z.strictObject({ expectedPaymentVersion: version, reasonCode: paymentReasonSchema });
export const reconciliationSchema = decisionSchema.extend({ decision: z.enum(["confirm", "dispute"]) });
export const intakeReviewSchema = decisionSchema.extend({ decision: z.enum(["convert", "dismiss"]) });
export const supersedeSchema = decisionSchema.extend(claimFields).refine(v => referenceValid(v.method, v.reference));
export const disputeSchema = z.strictObject({ expectedPaymentVersion: version, reasonCode: disputeReason });
export const resolutionSchema = z.strictObject({ expectedPaymentVersion: version, resolutionCode: paymentReasonSchema });
const targetState = z.enum(["due", "partially_paid", "paid", "disputed"]);
export const overrideSchema = decisionSchema.extend({ targetState });

const queryLimit = z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number).pipe(z.int().max(100)).default(25);
export const providerPageSchema = z.strictObject({ limit: queryLimit, afterId: uuid.optional() });
export const financePageSchema = providerPageSchema.extend({ afterReportedAt: z.iso.datetime({ offset: true }).optional() })
  .refine(v => Boolean(v.afterId) === Boolean(v.afterReportedAt));

const keyed = { p_request_key: uuid };
const decision = { ...keyed, p_expected_payment_version: version, p_reason_code: paymentReasonSchema };
const claim = { p_amount_paise: positivePaise, p_method: method, p_reference: reference };
const report = z.strictObject({ ...claim, ...keyed, p_booking_id: uuid })
  .refine(v => referenceValid(v.p_method, v.p_reference));
const financePage = z.strictObject({
  p_limit: z.int().min(1).max(100),
  p_after_reported_at: z.iso.datetime({ offset: true }).nullable(),
  p_after_id: uuid.nullable(),
}).refine(v => Boolean(v.p_after_id) === Boolean(v.p_after_reported_at));

/** Every input is validated here even when a service is called without HTTP. */
export const rpcSchemas = {
  report_collection: report,
  report_collection_exception: report,
  review_collection_intake: z.strictObject({ ...decision, p_intake_id: uuid, p_decision: z.enum(["convert", "dismiss"]) }),
  void_collection: z.strictObject({ ...decision, p_collection_id: uuid }),
  reconcile_collection: z.strictObject({ ...decision, p_collection_id: uuid, p_decision: z.enum(["confirm", "dispute"]) }),
  supersede_collection: z.strictObject({ ...decision, ...claim, p_collection_id: uuid })
    .refine(v => referenceValid(v.p_method, v.p_reference)),
  dispute_payment: z.strictObject({ ...keyed, p_booking_id: uuid, p_reason_code: disputeReason, p_expected_payment_version: version }),
  resolve_dispute: z.strictObject({ ...keyed, p_payment_id: uuid, p_resolution_code: paymentReasonSchema, p_expected_payment_version: version }),
  override_payment: z.strictObject({ ...decision, p_payment_id: uuid, p_target_state: targetState }),
  get_payment_summary: z.strictObject({ p_booking_id: uuid }),
  get_collection_intake_status: z.strictObject({ p_intake_id: uuid }),
  list_provider_payments: z.strictObject({ p_provider_id: uuid, p_limit: z.int().min(1).max(100), p_after_id: uuid.nullable() }),
  list_payment_queue: financePage,
  list_payment_exceptions: financePage,
};
export type PaymentCommand = keyof typeof rpcSchemas;
export type PaymentArgs<C extends PaymentCommand> = z.output<(typeof rpcSchemas)[C]>;
