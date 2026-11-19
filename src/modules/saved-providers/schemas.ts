import { z } from "zod";
import type { SavedProvider } from "./types";

export const providerIdSchema = z.uuid().transform((s) => s.toLowerCase());
export const idempotencyKeySchema = z.string().min(8).max(128);

export const savedProviderSchema = z.strictObject({
  providerId: z.uuid(),
  savedAt: z.iso.datetime({ offset: true }),
}) satisfies z.ZodType<SavedProvider>;
