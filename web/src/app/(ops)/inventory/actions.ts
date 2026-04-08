"use server";

import { revalidatePath } from "next/cache";
import {
  canWriteInventory,
  type AppRole,
  requireUser,
} from "@/lib/auth";

export type MortalityFormState = {
  error: string | null;
  success: string | null;
};

const allowedCauses = ["transit", "disease", "equipment", "unknown"] as const;

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function getRoleContext() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    role: (profile?.role as AppRole | null) ?? "admin",
  };
}

export async function recordMortalityAction(
  _previousState: MortalityFormState,
  formData: FormData,
): Promise<MortalityFormState> {
  const { supabase, role } = await getRoleContext();

  if (!canWriteInventory(role)) {
    return { error: "폐사 기록 등록 권한이 없습니다.", success: null };
  }

  const shipmentId = textValue(formData, "shipment_id");
  const speciesId = textValue(formData, "species_id");
  const recordedDate = textValue(formData, "recorded_date");
  const quantityRaw = textValue(formData, "quantity");
  const causeRaw = textValue(formData, "cause");
  const notes = textValue(formData, "notes");

  if (!shipmentId || !speciesId || !recordedDate) {
    return { error: "배치/품종/기록일은 필수입니다.", success: null };
  }

  const quantity = parsePositiveNumber(quantityRaw);
  if (quantity === null) {
    return { error: "폐사 수량은 0보다 커야 합니다.", success: null };
  }

  const cause = allowedCauses.includes(causeRaw as (typeof allowedCauses)[number])
    ? (causeRaw as (typeof allowedCauses)[number])
    : "unknown";

  const { data, error } = await supabase.rpc("record_mortality_with_stock_guard", {
    p_shipment_id: shipmentId,
    p_species_id: speciesId,
    p_recorded_date: recordedDate,
    p_quantity: quantity,
    p_cause: cause,
    p_notes: notes || null,
  });

  if (error) {
    return {
      error: `폐사 기록 저장 실패: ${error.message}`,
      success: null,
    };
  }

  const resultRow = Array.isArray(data) ? data[0] : data;
  const remainingQtyRaw = Number(resultRow?.remaining_qty ?? 0);
  const remainingQty = Number.isFinite(remainingQtyRaw) ? remainingQtyRaw : 0;

  revalidatePath("/inventory");
  revalidatePath("/shipments");
  revalidatePath("/dashboard");

  return {
    error: null,
    success: `폐사 ${quantity.toLocaleString("ko-KR")} 기록 완료 (잔량 ${remainingQty.toLocaleString("ko-KR")}).`,
  };
}
