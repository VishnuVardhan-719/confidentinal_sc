import { z } from "zod";
import { endpoint, json } from "@/lib/auth/http";
import { publicAuthClient } from "@/lib/db/request-client";
import { parse, query } from "@/lib/catalog/http";
import { publicProvider } from "@/lib/catalog/service";
import { categorySchema, pinSchema, providerReferenceSchema } from "@/lib/validation/catalog";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const id = parse(providerReferenceSchema, (await context.params).id);
    const value = query(request, z.strictObject({ category: categorySchema, pin: pinSchema }));
    return json(await publicProvider(publicAuthClient(), id, value.category, value.pin));
  });
}
