import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { fail, ok } from "@/lib/api/result";
import { syntheticTicket } from "@/fixtures/marketplace/support";
import { createTicketSchema, type SupportTicket } from "./schemas";
import type { SupportApi } from "./api";
export function createSupportFixtureApi(options: { env?: FixtureEnvironment; scenario?: "empty" | "escalated" } = {}): SupportApi {
  const guard = fixtureGuard(options.env);
  const rows = new Map<string, SupportTicket>(options.scenario === "escalated" ? [[syntheticTicket.id, structuredClone(syntheticTicket)]] : []);
  const intents = new Map<string, { body: string; ticket: SupportTicket }>();
  return {
    async list() { guard(); return ok({ items: structuredClone([...rows.values()]) }); },
    async get(id) { guard(); if (!z.uuid().safeParse(id).success) return fail("validation"); const row = rows.get(id); return row ? ok(structuredClone(row)) : fail("not_found"); },
    async create(input, key) {
      guard(); const parsed = createTicketSchema.safeParse(input);
      if (!parsed.success || !z.uuid().safeParse(key).success) return fail("validation");
      const body = JSON.stringify(parsed.data); const prior = intents.get(key);
      if (prior) return prior.body === body ? ok(structuredClone(prior.ticket)) : fail("conflict");
      const now = new Date().toISOString();
      const ticket: SupportTicket = { id: crypto.randomUUID(), reference: null, category: parsed.data.category, bookingId: parsed.data.bookingId ?? null,
        status: "OPEN", owner: null, createdAt: now, updatedAt: now, version: 1, synthetic: true };
      rows.set(ticket.id, ticket); intents.set(key, { body, ticket: structuredClone(ticket) });
      return ok(structuredClone(ticket));
    },
  };
}
