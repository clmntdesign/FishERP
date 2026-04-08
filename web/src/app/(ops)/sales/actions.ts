"use server";

import { revalidatePath } from "next/cache";
import {
  canCreateSales,
  canUpdateSales,
  type AppRole,
  requireUser,
} from "@/lib/auth";

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

  const { data, error } = await supabase.rpc("create_sale_with_stock_guard", {
    p_shipment_id: shipmentId,
    p_species_id: speciesId,
    p_buyer_id: buyerId,
    p_dispatch_date: dispatchDate,
    p_quantity: quantity,
    p_unit_price_krw: Math.round(unitPriceKrw),
    p_expected_payment_date: expectedPaymentDate || null,
    p_notes: notes || null,
  });

  if (error) {
    return {
      error: `판매 등록 실패: ${error.message}`,
      success: null,
    };
  }

  const resultRow = Array.isArray(data) ? data[0] : data;
  const remainingQtyRaw = Number(resultRow?.remaining_qty ?? 0);
  const remainingQty = Number.isFinite(remainingQtyRaw) ? remainingQtyRaw : 0;

  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/shipments");
  revalidatePath("/dashboard");

  return {
    error: null,
    success: `판매 등록 완료 (잔량 ${remainingQty.toLocaleString("ko-KR")}).`,
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
