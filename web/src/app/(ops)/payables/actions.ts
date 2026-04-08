"use server";

import { revalidatePath } from "next/cache";
import {
  canWritePayables,
  type AppRole,
  requireUser,
} from "@/lib/auth";

export type SupplierPaymentFormState = {
  error: string | null;
  success: string | null;
};

type AllocationInput = {
  ap_transaction_id: string;
  allocated_amount_krw: number;
};

type PaymentRpcRow = {
  payment_id: string;
  credit_transaction_id: string;
  allocated_total_krw: number;
  unallocated_amount_krw: number;
};

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseAllocations(raw: string): AllocationInput[] {
  if (!raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("배정 데이터 형식이 잘못되었습니다.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("배정 데이터 형식이 잘못되었습니다.");
  }

  const rows: AllocationInput[] = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      throw new Error("배정 데이터 형식이 잘못되었습니다.");
    }

    const txId = String(
      (item as { ap_transaction_id?: unknown }).ap_transaction_id ?? "",
    ).trim();
    const amountRaw = String(
      (item as { allocated_amount_krw?: unknown }).allocated_amount_krw ?? "",
    ).trim();

    if (!txId && !amountRaw) {
      continue;
    }

    const amount = parsePositiveNumber(amountRaw);

    if (!txId || amount === null) {
      throw new Error("배정 항목의 차변 또는 금액을 확인해 주세요.");
    }

    if (seen.has(txId)) {
      throw new Error("동일한 차변이 중복 배정되었습니다.");
    }

    seen.add(txId);
    rows.push({
      ap_transaction_id: txId,
      allocated_amount_krw: Math.round(amount),
    });
  }

  return rows;
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

export async function createSupplierPaymentAction(
  _previousState: SupplierPaymentFormState,
  formData: FormData,
): Promise<SupplierPaymentFormState> {
  const { supabase, role } = await getRoleContext();

  if (!canWritePayables(role)) {
    return { error: "미지급 지급 등록 권한이 없습니다.", success: null };
  }

  const supplierId = textValue(formData, "supplier_id");
  const paymentDate = textValue(formData, "payment_date");
  const totalAmountRaw = textValue(formData, "total_amount_krw");
  const bankReference = textValue(formData, "bank_reference");
  const notes = textValue(formData, "notes");
  const allocationsRaw = textValue(formData, "allocations_json");

  if (!supplierId || !paymentDate) {
    return { error: "공급처와 지급일은 필수입니다.", success: null };
  }

  const totalAmount = parsePositiveNumber(totalAmountRaw);
  if (totalAmount === null) {
    return {
      error: "지급 금액은 0보다 큰 숫자로 입력해 주세요.",
      success: null,
    };
  }

  let allocations: AllocationInput[] = [];

  try {
    allocations = parseAllocations(allocationsRaw);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "배정 데이터 확인 중 오류가 발생했습니다.",
      success: null,
    };
  }

  const roundedTotal = Math.round(totalAmount);
  const allocatedSum = allocations.reduce(
    (sum, row) => sum + row.allocated_amount_krw,
    0,
  );

  if (allocatedSum > roundedTotal) {
    return {
      error: "배정 합계가 지급금액을 초과했습니다.",
      success: null,
    };
  }

  const { data, error } = await supabase.rpc("create_ap_payment_with_allocations", {
    p_supplier_id: supplierId,
    p_payment_date: paymentDate,
    p_total_amount_krw: roundedTotal,
    p_bank_reference: bankReference || null,
    p_notes: notes || null,
    p_allocations: allocations,
  });

  if (error) {
    return {
      error: `지급 등록 실패: ${error.message}`,
      success: null,
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as PaymentRpcRow | null;
  const allocatedTotal = Number(row?.allocated_total_krw ?? allocatedSum);
  const unallocatedAmount = Number(
    row?.unallocated_amount_krw ?? roundedTotal - allocatedTotal,
  );

  revalidatePath("/payables");
  revalidatePath("/dashboard");

  return {
    error: null,
    success:
      allocatedTotal > 0
        ? `지급 등록 완료 (배정 ${allocatedTotal.toLocaleString("ko-KR")}, 미배정 ${unallocatedAmount.toLocaleString("ko-KR")}).`
        : "지급 등록 완료.",
  };
}
