import { z } from "zod";
import { authenticate, IdentityError } from "./identity";
import { requestClient } from "@/lib/db/request-client";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
}
export async function input<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  // Bounded streaming also covers chunked requests without Content-Length.
  if (!request.body) throw new IdentityError(422, "invalid_input");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); throw new IdentityError(422, "invalid_input"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return schema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { throw new IdentityError(422, "invalid_input"); }
  finally { reader.releaseLock(); }
}
export async function endpoint(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof IdentityError) return json({ error: { code: error.code } }, error.status);
    return json({ error: { code: "identity_unavailable" } }, 500);
  }
}
export async function session(request: Request) {
  const db = requestClient(request);
  const actor = await authenticate(db);
  return { db, actor };
}
