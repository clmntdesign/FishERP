import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AppRole =
  | "admin"
  | "operations_manager"
  | "procurement_officer"
  | "accounts"
  | "viewer";

export const masterDataWriteRoles: AppRole[] = ["admin", "operations_manager"];
export const shipmentWriteRoles: AppRole[] = [
  "admin",
  "operations_manager",
  "procurement_officer",
];
export const inventoryWriteRoles: AppRole[] = [
  "admin",
  "operations_manager",
  "procurement_officer",
];
export const salesCreateRoles: AppRole[] = [
  "admin",
  "operations_manager",
  "procurement_officer",
];
export const salesUpdateRoles: AppRole[] = [
  "admin",
  "operations_manager",
  "procurement_officer",
  "accounts",
];
export const payablesWriteRoles: AppRole[] = [
  "admin",
  "accounts",
];

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

export function canWriteShipments(role: AppRole) {
  return shipmentWriteRoles.includes(role);
}

export function canWriteInventory(role: AppRole) {
  return inventoryWriteRoles.includes(role);
}

export function canCreateSales(role: AppRole) {
  return salesCreateRoles.includes(role);
}

export function canUpdateSales(role: AppRole) {
  return salesUpdateRoles.includes(role);
}

export function canWritePayables(role: AppRole) {
  return payablesWriteRoles.includes(role);
}
