import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AppRole =
  | "admin"
  | "operations_manager"
  | "procurement_officer"
  | "accounts"
  | "viewer";

export const masterDataWriteRoles: AppRole[] = ["admin", "operations_manager"];

export async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function getCurrentRole() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return (profile?.role as AppRole | null) ?? "admin";
}

export function canWriteMasterData(role: AppRole) {
  return masterDataWriteRoles.includes(role);
}
