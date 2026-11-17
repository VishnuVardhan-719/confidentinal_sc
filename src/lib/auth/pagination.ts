import { IdentityError } from "./identity";
import { listQuerySchema } from "@/lib/validation/identity";

export function listQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new IdentityError(422, "invalid_input");
  const result = listQuerySchema.safeParse(Object.fromEntries(params));
  if (!result.success) throw new IdentityError(422, "invalid_input");
  return result.data;
}
