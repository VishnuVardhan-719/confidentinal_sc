import { endpoint, json } from "@/lib/auth/http";
import { publicAuthClient } from "@/lib/db/request-client";
import { query } from "@/lib/catalog/http";
import { searchCatalog } from "@/lib/catalog/service";
import { searchSchema } from "@/lib/validation/catalog";

export async function GET(request: Request) {
  return endpoint(async () => {
    const value = query(request, searchSchema);
    return json(await searchCatalog(publicAuthClient(), value));
  });
}
