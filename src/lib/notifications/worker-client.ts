import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export function notificationWorkerClient() {
  const url = z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = z.string().min(1).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  // This schema exposes only claim/complete to service_role; all N01 tables and
  // expand/sweep are denied. No user JWT or public-key fallback exists.
  return createClient(url, key, { db: { schema: "notify_worker" }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
