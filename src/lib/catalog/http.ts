import { z } from "zod";
import { IdentityError } from "@/lib/auth/identity";

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError(422, "invalid_input");
  return result.data;
}
export function query<T>(request: Request, schema: z.ZodType<T>) {
  const params = new URL(request.url).searchParams;
  if (new Set(params.keys()).size !== Array.from(params.keys()).length) throw new IdentityError(422, "invalid_input");
  return parse(schema, Object.fromEntries(params));
}
export function requestKey(request: Request) {
  return parse(z.uuid(), request.headers.get("Idempotency-Key"));
}
export async function routeId(context: { params: Promise<{ id: string }> }) {
  return parse(z.uuid(), (await context.params).id);
}
