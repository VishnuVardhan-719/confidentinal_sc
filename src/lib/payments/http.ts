import { z } from "zod";
import { IdentityError } from "@/lib/auth/identity";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { parse, query, requestKey } from "@/lib/catalog/http";
import { isEnabled } from "@/lib/feature-flags";
import { paymentCommand } from "./service";
import {
  collectionSchema, decisionSchema, disputeSchema, financePageSchema,
  intakeReviewSchema, overrideSchema, providerPageSchema, reconciliationSchema,
  resolutionSchema, rpcSchemas, supersedeSchema, type PaymentCommand,
} from "@/lib/validation/payments";

type Context = { params: Promise<Record<string, string>> };

async function argumentsFor(name: PaymentCommand, request: Request, params: Record<string, string>) {
  const id = () => parse(z.uuid(), params.id);
  switch (name) {
    case "get_payment_summary": return { p_booking_id: id() };
    case "get_collection_intake_status": return { p_intake_id: id() };
    case "list_provider_payments": {
      const v = query(request, providerPageSchema);
      return { p_provider_id: id(), p_limit: v.limit, p_after_id: v.afterId ?? null };
    }
    case "list_payment_queue":
    case "list_payment_exceptions": {
      const v = query(request, financePageSchema);
      return { p_limit: v.limit, p_after_reported_at: v.afterReportedAt ?? null, p_after_id: v.afterId ?? null };
    }
  }
  const p_request_key = requestKey(request);
  const target = id();
  switch (name) {
    case "report_collection":
    case "report_collection_exception": {
      const v = await input(request, collectionSchema);
      return { p_booking_id: target, p_amount_paise: v.amountPaise, p_method: v.method, p_reference: v.reference, p_request_key };
    }
    case "void_collection": {
      const collection = parse(z.uuid(), params.cid);
      const v = await input(request, decisionSchema);
      // Both URL identifiers are validated. The collection RPC authorizes its
      // own collection target; its published signature has no booking argument.
      return { p_collection_id: collection, p_expected_payment_version: v.expectedPaymentVersion, p_reason_code: v.reasonCode, p_request_key };
    }
    case "review_collection_intake": {
      const v = await input(request, intakeReviewSchema);
      return { p_intake_id: target, p_decision: v.decision, p_reason_code: v.reasonCode, p_expected_payment_version: v.expectedPaymentVersion, p_request_key };
    }
    case "reconcile_collection": {
      const v = await input(request, reconciliationSchema);
      return { p_collection_id: target, p_decision: v.decision, p_reason_code: v.reasonCode, p_expected_payment_version: v.expectedPaymentVersion, p_request_key };
    }
    case "supersede_collection": {
      const v = await input(request, supersedeSchema);
      return { p_collection_id: target, p_amount_paise: v.amountPaise, p_method: v.method, p_reference: v.reference, p_reason_code: v.reasonCode, p_expected_payment_version: v.expectedPaymentVersion, p_request_key };
    }
    case "dispute_payment": {
      const v = await input(request, disputeSchema);
      return { p_booking_id: target, p_reason_code: v.reasonCode, p_expected_payment_version: v.expectedPaymentVersion, p_request_key };
    }
    case "resolve_dispute": {
      const v = await input(request, resolutionSchema);
      return { p_payment_id: target, p_resolution_code: v.resolutionCode, p_expected_payment_version: v.expectedPaymentVersion, p_request_key };
    }
    case "override_payment": {
      const v = await input(request, overrideSchema);
      return { p_payment_id: target, p_target_state: v.targetState, p_reason_code: v.reasonCode, p_expected_payment_version: v.expectedPaymentVersion, p_request_key };
    }
  }
}

const responseKeys: Record<PaymentCommand, string> = {
  report_collection: "id", report_collection_exception: "id", supersede_collection: "id",
  review_collection_intake: "result", void_collection: "result", reconcile_collection: "result",
  dispute_payment: "result", resolve_dispute: "result", override_payment: "result",
  get_payment_summary: "payment", get_collection_intake_status: "intake",
  list_provider_payments: "payments", list_payment_queue: "collections", list_payment_exceptions: "exceptions",
};

/** Bind a fixed operation in each route file; no client-chosen RPC dispatch. */
export function paymentRoute(name: PaymentCommand) {
  return async (request: Request, context: Context) => endpoint(async () => {
    if (!isEnabled("payAfter")) throw new IdentityError(404, "feature_unavailable");
    const { db } = await session(request);
    const args = await argumentsFor(name, request, await context.params);
    const parsed = rpcSchemas[name].safeParse(args);
    if (!parsed.success) throw new IdentityError(422, "invalid_input");
    const result = await paymentCommand(db, name, parsed.data);
    return json({ [responseKeys[name]]: result });
  });
}
