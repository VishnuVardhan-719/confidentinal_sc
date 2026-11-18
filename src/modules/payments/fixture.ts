import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import { syntheticPayment } from "@/fixtures/marketplace/payments";
import { collectionRecordSchema, type PaymentStatus, type PaymentSummary } from "./schemas";
import type { SyntheticMarketplaceStore } from "@/fixtures/marketplace/booking-store";
import type { PaymentsApi } from "./api";
/** With `store`, summaries come from the shared synthetic marketplace and unknown bookings are not found. */
export function createPaymentsFixtureApi(options: { env?: FixtureEnvironment; status?: PaymentStatus; store?: SyntheticMarketplaceStore; now?: () => Date } = {}): PaymentsApi {
  const guard = fixtureGuard(options.env);
  const store = options.store;
  const rows = store?.payments ?? new Map<string, PaymentSummary>();
  const intents = new Map<string, { body: string; version: number }>();
  return {
    async getSummary(id) {
      guard(); if (!z.uuid().safeParse(id).success) return fail("validation");
      id = id.toLowerCase();
      if (store) { store.tick((options.now ?? (() => new Date()))()); const row = rows.get(id); return row ? ok(structuredClone(row)) : fail("not_found"); }
      if (!rows.has(id)) rows.set(id, syntheticPayment(id, options.status));
      return ok(structuredClone(rows.get(id)!));
    },
    async recordCollection(input, key) {
      guard(); const parsed = collectionRecordSchema.safeParse(input);
      if (!parsed.success || !z.uuid().safeParse(key).success) return fail("validation");
      parsed.data.bookingId = parsed.data.bookingId.toLowerCase();
      const body = JSON.stringify(parsed.data); const prior = intents.get(key);
      if (prior) return prior.body === body ? ok({ version: prior.version }) : fail("conflict");
      if (store && !rows.has(parsed.data.bookingId)) return fail("not_found");
      const row = rows.get(parsed.data.bookingId) ?? syntheticPayment(parsed.data.bookingId, options.status);
      if (row.version !== parsed.data.expectedVersion || parsed.data.amountPaise > row.amountDuePaise || !["DUE", "PARTIALLY_PAID"].includes(row.status)) return fail("conflict");
      // Synthetic collection claim only. Reconciliation/payment status remains independent.
      row.version++; rows.set(row.bookingId, row); intents.set(key, { body, version: row.version });
      return ok({ version: row.version });
    },
  };
}
