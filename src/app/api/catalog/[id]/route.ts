import { z } from "zod";
import { endpoint, json } from "@/lib/auth/http";
import { publicAuthClient } from "@/lib/db/request-client";
import { query, routeId } from "@/lib/catalog/http";
import { publicProvider } from "@/lib/catalog/service";
import { categorySchema, pinSchema } from "@/lib/validation/catalog";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const id = await routeId(context);
    const value = query(request, z.strictObject({ category: categorySchema, pin: pinSchema }));
    return json(await publicProvider(publicAuthClient(), id, value.category, value.pin));
  });
}
