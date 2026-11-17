import { createBrowserClient } from "@supabase/ssr";
import { parsePublicEnv } from "@/lib/env";

/** Browser client. Uses only the public anon key; RLS is the security boundary. */
export function createBrowserSupabase() {
  const env = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
