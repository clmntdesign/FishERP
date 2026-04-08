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

export async function createSupplierPaymentAction(
  _previousState: SupplierPaymentFormState,
  formData: FormData,
): Promise<SupplierPaymentFormState> {
  const { supabase, user, role } = await getRoleContext();

  if (!canWritePayables(role)) {
    return { error: "미지급 지급 등록 권한이 없습니다.", success: null };
  }

  const supplierId = textValue(formData, "supplier_id");
  const paymentDate = textValue(formData, "payment_date");
  const totalAmountRaw = textValue(formData, "total_amount_krw");
  const bankReference = textValue(formData, "bank_reference");
  const notes = textValue(formData, "notes");
  const targetDebitTransactionId = textValue(formData, "target_debit_transaction_id");
  const allocationAmountRaw = textValue(formData, "allocated_amount_krw");

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

  let finalAllocationAmount = 0;
  let allocationTarget: { id: string; amount_krw: number } | null = null;

  if (targetDebitTransactionId) {
    const { data: targetDebit, error: targetDebitError } = await supabase
      .from("ap_transactions")
      .select("id, amount_krw, supplier_id, type")
      .eq("id", targetDebitTransactionId)
      .eq("type", "debit")
      .maybeSingle();

    if (targetDebitError) {
      return {
        error: `배정 대상 조회 실패: ${targetDebitError.message}`,
        success: null,
      };
    }

    if (!targetDebit || targetDebit.supplier_id !== supplierId) {
      return {
        error: "선택한 차변 거래가 없거나 공급처가 일치하지 않습니다.",
        success: null,
      };
    }

    const requestedAllocation = allocationAmountRaw
      ? parsePositiveNumber(allocationAmountRaw)
      : totalAmount;

    if (!requestedAllocation) {
      return {
        error: "배정 금액은 0보다 큰 값이어야 합니다.",
        success: null,
      };
    }

    const { data: existingAllocRows, error: existingAllocError } = await supabase
      .from("ap_payment_allocations")
      .select("allocated_amount_krw")
      .eq("ap_transaction_id", targetDebit.id);

    if (existingAllocError) {
      return {
        error: `기존 배정 조회 실패: ${existingAllocError.message}`,
        success: null,
      };
    }

    const allocatedSoFar = (existingAllocRows ?? []).reduce(
      (sum, row) => sum + Number(row.allocated_amount_krw ?? 0),
      0,
    );
    const remainingDebit = Number(targetDebit.amount_krw ?? 0) - allocatedSoFar;

    if (remainingDebit <= 0) {
      return {
        error: "선택한 차변은 이미 전액 배정되었습니다.",
        success: null,
      };
    }

    finalAllocationAmount = Math.min(requestedAllocation, totalAmount, remainingDebit);
    allocationTarget = {
      id: targetDebit.id,
      amount_krw: Number(targetDebit.amount_krw ?? 0),
    };
  }

  let paymentId: string | null = null;
  let creditTransactionId: string | null = null;

  try {
    const { data: payment, error: paymentError } = await supabase
      .from("ap_payments")
      .insert({
        supplier_id: supplierId,
        payment_date: paymentDate,
        total_amount_krw: Math.round(totalAmount),
        bank_reference: bankReference || null,
        notes: notes || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      return {
        error: `지급 등록 실패: ${paymentError?.message ?? "등록 실패"}`,
        success: null,
      };
    }

    paymentId = payment.id;

    const { data: creditTx, error: creditError } = await supabase
      .from("ap_transactions")
      .insert({
        supplier_id: supplierId,
        transaction_date: paymentDate,
        type: "credit",
        amount_krw: Math.round(totalAmount),
        bank_reference: bankReference || null,
        description: notes ? `지급: ${notes}` : "지급 등록",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (creditError || !creditTx) {
      throw new Error(creditError?.message ?? "지급 크레딧 분개 생성 실패");
    }

    creditTransactionId = creditTx.id;

    if (allocationTarget && finalAllocationAmount > 0) {
      const { error: allocError } = await supabase.from("ap_payment_allocations").insert({
        ap_payment_id: paymentId,
        ap_transaction_id: allocationTarget.id,
        allocated_amount_krw: Math.round(finalAllocationAmount),
      });

      if (allocError) {
        throw new Error(allocError.message);
      }
    }
  } catch (error) {
    if (creditTransactionId) {
      await supabase.from("ap_transactions").delete().eq("id", creditTransactionId);
    }
    if (paymentId) {
      await supabase.from("ap_payments").delete().eq("id", paymentId);
    }

    return {
      error:
        error instanceof Error
          ? `지급 등록 중 오류: ${error.message}`
          : "지급 등록 중 오류가 발생했습니다.",
      success: null,
    };
  }

  revalidatePath("/payables");
  revalidatePath("/dashboard");

  return {
    error: null,
    success: allocationTarget
      ? `지급 등록 완료 (배정 ${Math.round(finalAllocationAmount).toLocaleString("ko-KR")}).`
      : "지급 등록 완료.",
  };
}
