"use server";

import { revalidatePath } from "next/cache";
import {
  canCreateSales,
  canUpdateSales,
  type AppRole,
  requireUser,
} from "@/lib/auth";
import { getShipmentSpeciesStock } from "@/lib/server/stock";

export type SaleCreateFormState = {
  error: string | null;
  success: string | null;
};

const allowedSaleStatuses = ["dispatched", "invoiced", "paid", "overdue"] as const;

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function createSaleAction(
  _previousState: SaleCreateFormState,
  formData: FormData,
): Promise<SaleCreateFormState> {
  const { supabase, role } = await getRoleContext();

  if (!canCreateSales(role)) {
    return { error: "판매 등록 권한이 없습니다.", success: null };
  }

  const shipmentId = textValue(formData, "shipment_id");
  const speciesId = textValue(formData, "species_id");
  const buyerId = textValue(formData, "buyer_id");
  const dispatchDate = textValue(formData, "dispatch_date");
  const quantityRaw = textValue(formData, "quantity");
  const unitPriceRaw = textValue(formData, "unit_price_krw");
  const expectedPaymentDate = textValue(formData, "expected_payment_date");
  const notes = textValue(formData, "notes");

  if (!shipmentId || !speciesId || !buyerId || !dispatchDate) {
    return { error: "배치/품종/거래처/출하일은 필수입니다.", success: null };
  }

  const quantity = parsePositiveNumber(quantityRaw);
  const unitPriceKrw = parsePositiveNumber(unitPriceRaw);

  if (quantity === null || unitPriceKrw === null) {
    return {
      error: "판매 수량과 단가는 0보다 큰 숫자로 입력해 주세요.",
      success: null,
    };
  }

  const { count, error: lineError } = await supabase
    .from("shipment_line_items")
    .select("id", { count: "exact", head: true })
    .eq("shipment_id", shipmentId)
    .eq("species_id", speciesId);

  if (lineError) {
    return {
      error: `배치 품종 확인 실패: ${lineError.message}`,
      success: null,
    };
  }

  if (!count || count <= 0) {
    return {
      error: "선택한 배치에는 해당 품종 입고 기록이 없습니다.",
      success: null,
    };
  }

  let stock;
  try {
    stock = await getShipmentSpeciesStock(supabase, shipmentId, speciesId);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "재고 검증 중 오류가 발생했습니다.",
      success: null,
    };
  }

  if (quantity > stock.remainingQty) {
    return {
      error: `재고 부족: 현재 잔량 ${stock.remainingQty.toLocaleString("ko-KR")} 보다 큰 수량은 판매할 수 없습니다.`,
      success: null,
    };
  }

  const { error } = await supabase.from("sales").insert({
    shipment_id: shipmentId,
    species_id: speciesId,
    buyer_id: buyerId,
    dispatch_date: dispatchDate,
    quantity,
    unit_price_krw: Math.round(unitPriceKrw),
    expected_payment_date: expectedPaymentDate || null,
    status: "dispatched",
    notes: notes || null,
  });

  if (error) {
    return {
      error: `판매 등록 실패: ${error.message}`,
      success: null,
    };
  }

  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/shipments");
  revalidatePath("/dashboard");

  const nextRemaining = stock.remainingQty - quantity;
  return {
    error: null,
    success: `판매 등록 완료 (잔량 ${nextRemaining.toLocaleString("ko-KR")}).`,
  };
}

export async function updateSaleStatusAction(formData: FormData) {
  const { supabase, role } = await getRoleContext();

  if (!canUpdateSales(role)) {
    return;
  }

  const saleId = textValue(formData, "sale_id");
  const statusRaw = textValue(formData, "status");
  const expectedPaymentDate = textValue(formData, "expected_payment_date");
  const actualPaymentDateRaw = textValue(formData, "actual_payment_date");

  if (!saleId) return;

  const status = allowedSaleStatuses.includes(
    statusRaw as (typeof allowedSaleStatuses)[number],
  )
    ? (statusRaw as (typeof allowedSaleStatuses)[number])
    : "dispatched";

  const actualPaymentDate =
    status === "paid"
      ? actualPaymentDateRaw || todayIso()
      : actualPaymentDateRaw || null;

  const { error } = await supabase
    .from("sales")
    .update({
      status,
      expected_payment_date: expectedPaymentDate || null,
      actual_payment_date: actualPaymentDate,
    })
    .eq("id", saleId);

  if (error) {
    console.error("[FishERP] updateSaleStatusAction failed", error.message);
    return;
  }

  revalidatePath("/sales");
  revalidatePath("/dashboard");
}
