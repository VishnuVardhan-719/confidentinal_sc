import { z } from "zod";
import { fail } from "@/lib/api/result";
import { markReadSchema } from "./schemas";
import type { NotificationsApi } from "./api";
/** Outbox delivery is not an in-app inbox contract. No speculative network calls. */
export function createNotificationsHttpApi(): NotificationsApi {
  return {
    async list() { return fail("gated"); },
    async markRead(id, input) { return fail(z.uuid().safeParse(id).success && markReadSchema.safeParse(input).success ? "gated" : "validation"); },
  };
}
