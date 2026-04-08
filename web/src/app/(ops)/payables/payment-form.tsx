"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createSupplierPaymentAction,
  type SupplierPaymentFormState,
} from "@/app/(ops)/payables/actions";

type SupplierOption = {
  id: string;
  code: string;
  name_kr: string;
};

export type OpenDebitOption = {
  id: string;
  supplier_id: string;
  shipment_number: string | null;
  transaction_date: string;
  amount_krw: number;
  remaining_krw: number;
};

type PaymentFormProps = {
  suppliers: SupplierOption[];
  openDebits: OpenDebitOption[];
};

const initialState: SupplierPaymentFormState = {
  error: null,
  success: null,
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-xs font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "저장 중..." : "지급 등록"}
    </button>
  );
}

export function PaymentForm({ suppliers, openDebits }: PaymentFormProps) {
  const [state, formAction] = useActionState(createSupplierPaymentAction, initialState);

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");

  const supplierDebits = useMemo(
    () => openDebits.filter((row) => row.supplier_id === supplierId),
    [openDebits, supplierId],
  );

  const [targetDebitId, setTargetDebitId] = useState("");

  const selectedTarget = targetDebitId
    ? supplierDebits.find((row) => row.id === targetDebitId) ?? null
    : null;

  const disabled = suppliers.length === 0;

  return (
    <form action={formAction} className="rounded-xl border border-line bg-canvas p-3">
      <h3 className="text-sm font-semibold text-text-primary">지급 등록</h3>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">공급처</span>
          <select
            name="supplier_id"
            value={supplierId}
            onChange={(event) => {
              const nextSupplier = event.target.value;
              setSupplierId(nextSupplier);
              setTargetDebitId("");
            }}
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          >
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name_kr} ({supplier.code})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">지급일</span>
          <input
            name="payment_date"
            type="date"
            defaultValue={todayIso()}
            required
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">지급금액 (KRW)</span>
          <input
            name="total_amount_krw"
            type="number"
            min="0"
            step="1"
            required
            placeholder="예: 2500000"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">은행 참조</span>
          <input
            name="bank_reference"
            placeholder="이체 메모 / 증빙번호"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">배정 대상 차변 (선택)</span>
          <select
            name="target_debit_transaction_id"
            value={targetDebitId}
            onChange={(event) => setTargetDebitId(event.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          >
            <option value="">배정하지 않음</option>
            {supplierDebits.map((debit) => (
              <option key={debit.id} value={debit.id}>
                {debit.transaction_date} · {debit.shipment_number ?? "직접거래"} · 잔액{" "}
                {debit.remaining_krw.toLocaleString("ko-KR")}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">배정금액 (선택)</span>
          <input
            name="allocated_amount_krw"
            type="number"
            min="0"
            step="1"
            placeholder="미입력 시 지급금액 기준"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">비고</span>
          <input
            name="notes"
            placeholder="지급 목적 또는 참고사항"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>
      </div>

      {selectedTarget ? (
        <p className="mt-2 text-xs text-text-secondary">
          선택 차변 잔액: {selectedTarget.remaining_krw.toLocaleString("ko-KR")}
        </p>
      ) : null}

      {state.error ? (
        <p className="mt-3 rounded-xl border border-warning/30 bg-orange-50 px-3 py-2 text-xs text-warning">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="mt-3 rounded-xl border border-accent/30 bg-emerald-50 px-3 py-2 text-xs text-accent-strong">
          {state.success}
        </p>
      ) : null}

      <div className="mt-3 flex justify-end">
        <SubmitButton disabled={disabled} />
      </div>
    </form>
  );
}
