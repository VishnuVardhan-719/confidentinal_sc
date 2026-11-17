import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parsePublicEnv } from "@/lib/env";

/**
 * Per-request server client acting as the signed-in user (anon key + user JWT).
 * Never use the service-role key here; privileged work belongs in reviewed server jobs.
 */
export async function createServerSupabase() {
  const env = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookie writes are ignored; the proxy refreshes sessions.
        }
      },
    },
  });
}
