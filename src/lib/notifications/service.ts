import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { IdentityError } from "@/lib/auth/identity";
import { inboxPageSchema, notificationSchema, preferenceRowSchema, resultSchemas, rpcSchemas, type NotificationArgs, type NotificationCommand } from "./schemas";

export function notificationError(code: string, message: string) {
  if (code === "55000" && message === "feature_unavailable") return new IdentityError(404, "feature_unavailable");
  if (code === "55000" && message === "feature_suspended") return new IdentityError(503, "notifications_unavailable");
  if (["28000", "28P01", "PGRST301", "PGRST302", "PGRST303"].includes(code)) return new IdentityError(401, "unauthenticated");
  if (["42501", "P0002"].includes(code)) return new IdentityError(404, "not_found");
  if (["40001", "40P01", "23505", "55000"].includes(code)) return new IdentityError(409, "conflict");
  if (["22023", "22003", "22007", "22008", "23503", "23514"].includes(code)) return new IdentityError(422, "invalid_input");
  if (code === "53300") return new IdentityError(429, "rate_limited");
  return new IdentityError(503, "notifications_unavailable");
}
async function safe<T>(operation: () => PromiseLike<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof IdentityError) throw error;
    throw new IdentityError(503, "notifications_unavailable");
  }
}
function checked<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new IdentityError(503, "notifications_unavailable");
  return result.data;
}
/** A user JWT only; SQL owns authorization, versions, consent and rate limits.
 * None of the four published N01 RPCs is keyed. Do not invent a request key. */
export async function notificationCommand<C extends NotificationCommand>(db: Pick<SupabaseClient, "rpc">, name: C, args: NotificationArgs<C>) {
  const parsed = rpcSchemas[name].safeParse(args);
  if (!parsed.success) throw new IdentityError(422, "invalid_input");
  return safe(async () => {
    const { data, error } = await db.rpc(name, parsed.data);
    if (error) throw notificationError(error.code, error.message);
    return checked(resultSchemas[name] as z.ZodType<number | z.infer<typeof resultSchemas.list_notification_failures>>, data);
  });
}
export async function inbox(db: Pick<SupabaseClient, "from">, cursor: z.input<typeof inboxPageSchema>) {
  const parsed = inboxPageSchema.safeParse(cursor);
  if (!parsed.success) throw new IdentityError(422, "invalid_input");
  return safe(async () => {
    let q = db.from("notifications").select("id,template_key,template_version,priority,booking_id,params,created_at,read_at")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(20);
    if (parsed.data.before && parsed.data.beforeId) {
      const { before, beforeId } = parsed.data;
      q = q.or(`created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`);
    }
    const { data, error } = await q;
    if (error) throw notificationError(error.code, error.message);
    const rows = checked(z.array(notificationSchema).max(20), data);
    const last = rows.length === 20 ? rows.at(-1) : undefined;
    return { notifications: rows, nextCursor: last ? { before: last.created_at, beforeId: last.id } : null };
  });
}
export async function unreadCount(db: Pick<SupabaseClient, "from">) {
  return safe(async () => {
    const { count, error } = await db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
    if (error) throw notificationError(error.code, error.message);
    return checked(z.number().int().nonnegative(), count);
  });
}
export async function preferences(db: Pick<SupabaseClient, "from">) {
  return safe(async () => {
    const { data, error } = await db.from("notification_preferences").select("channel,topic,enabled,version,updated_at").order("channel").order("topic");
    if (error) throw notificationError(error.code, error.message);
    return checked(z.array(preferenceRowSchema).max(9), data);
  });
}
