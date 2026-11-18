import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import { syntheticPayment } from "@/fixtures/marketplace/payments";
import { collectionRecordSchema, type PaymentStatus, type PaymentSummary } from "./schemas";
import type { PaymentsApi } from "./api";
export function createPaymentsFixtureApi(options: { env?: FixtureEnvironment; status?: PaymentStatus } = {}): PaymentsApi {
  const guard = fixtureGuard(options.env);
  const rows = new Map<string, PaymentSummary>();
  const intents = new Map<string, { body: string; version: number }>();
  return {
    async getSummary(id) {
      guard(); if (!z.uuid().safeParse(id).success) return fail("validation");
      if (!rows.has(id)) rows.set(id, syntheticPayment(id, options.status));
      return ok(structuredClone(rows.get(id)!));
    },
    async recordCollection(input, key) {
      guard(); const parsed = collectionRecordSchema.safeParse(input);
      if (!parsed.success || !z.uuid().safeParse(key).success) return fail("validation");
      const body = JSON.stringify(parsed.data); const prior = intents.get(key);
      if (prior) return prior.body === body ? ok({ version: prior.version }) : fail("conflict");
      const row = rows.get(parsed.data.bookingId) ?? syntheticPayment(parsed.data.bookingId, options.status);
      if (row.version !== parsed.data.expectedVersion || parsed.data.amountPaise > row.amountDuePaise || !["DUE", "PARTIALLY_PAID"].includes(row.status)) return fail("conflict");
      // Synthetic collection claim only. Reconciliation/payment status remains independent.
      row.version++; rows.set(row.bookingId, row); intents.set(key, { body, version: row.version });
      return ok({ version: row.version });
    },
  };
}
