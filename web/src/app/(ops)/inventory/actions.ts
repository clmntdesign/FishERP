"use server";

import { revalidatePath } from "next/cache";
import {
  canWriteInventory,
  type AppRole,
  requireUser,
} from "@/lib/auth";
import { getShipmentSpeciesStock } from "@/lib/server/stock";

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
  const { supabase, user, role } = await getRoleContext();

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

  let stock;
  try {
    stock = await getShipmentSpeciesStock(supabase, shipmentId, speciesId);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "재고 조회 중 오류가 발생했습니다.",
      success: null,
    };
  }

  if (stock.intakeQty <= 0) {
    return {
      error: "선택한 배치에 해당 품종 입고 라인이 없습니다.",
      success: null,
    };
  }

  if (quantity > stock.remainingQty) {
    return {
      error: `재고 부족: 현재 잔량 ${stock.remainingQty.toLocaleString("ko-KR")} 보다 큰 수량은 기록할 수 없습니다.`,
      success: null,
    };
  }

  const { error } = await supabase.from("mortality_records").insert({
    shipment_id: shipmentId,
    species_id: speciesId,
    recorded_date: recordedDate,
    quantity,
    cause,
    notes: notes || null,
    recorded_by: user.id,
  });

  if (error) {
    return {
      error: `폐사 기록 저장 실패: ${error.message}`,
      success: null,
    };
  }

  revalidatePath("/inventory");
  revalidatePath("/shipments");
  revalidatePath("/dashboard");

  const nextRemaining = stock.remainingQty - quantity;

  return {
    error: null,
    success: `폐사 ${quantity.toLocaleString("ko-KR")} 기록 완료 (잔량 ${nextRemaining.toLocaleString("ko-KR")}).`,
  };
}
