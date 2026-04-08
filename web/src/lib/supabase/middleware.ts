import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { tryGetSupabaseEnv } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = tryGetSupabaseEnv();

  if (!env) {
    return { response, user: null, authError: "missing_supabase_env" as const };
  }

  const { url, anonKey } = env;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      return { response, user: null, authError: error.message };
    }

    return { response, user, authError: null };
  } catch {
    return { response, user: null, authError: "supabase_auth_unreachable" as const };
  }
}
