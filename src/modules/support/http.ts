import { z } from "zod";
import { fail } from "@/lib/api/result";
import type { SupportApi } from "./api";
import { createTicketSchema } from "./schemas";
/** Proposed route has no implemented DTO/ownership contract on inspected backend refs. */
export function createSupportHttpApi(): SupportApi {
  return {
    async list() { return fail("gated"); },
    async get(id) { return fail(z.uuid().safeParse(id).success ? "gated" : "validation"); },
    async create(input, key) { return fail(createTicketSchema.safeParse(input).success && z.uuid().safeParse(key).success ? "gated" : "validation"); },
  };
}
