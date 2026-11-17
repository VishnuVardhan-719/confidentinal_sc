import { z } from "zod";
import { endpoint, json, session } from "@/lib/auth/http";
import { query } from "@/lib/catalog/http";
import { coverageQueue } from "@/lib/catalog/service";
import { queueCursorSchema } from "@/lib/validation/catalog";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const value = query(request, z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: queueCursorSchema.optional() }));
    return json(await coverageQueue(db, value.limit, value.cursor));
  });
}
