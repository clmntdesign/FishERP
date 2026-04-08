import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();

  return createClient(url, anonKey);
}
