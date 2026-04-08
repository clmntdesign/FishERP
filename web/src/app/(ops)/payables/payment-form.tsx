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
  allocated_krw: number;
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
  const [totalAmountRaw, setTotalAmountRaw] = useState("");
  const [allocationInputs, setAllocationInputs] = useState<Record<string, string>>({});

  const supplierDebits = useMemo(
    () => openDebits.filter((row) => row.supplier_id === supplierId),
    [openDebits, supplierId],
  );

  const totalAmount = useMemo(() => {
    const parsed = Number(totalAmountRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed);
  }, [totalAmountRaw]);

  const allocationRows = useMemo(
    () =>
      supplierDebits
        .map((debit) => {
          const parsed = Number(allocationInputs[debit.id] ?? "");
          if (!Number.isFinite(parsed) || parsed <= 0) return null;
          return {
            ap_transaction_id: debit.id,
            allocated_amount_krw: Math.round(parsed),
          };
        })
        .filter((row): row is { ap_transaction_id: string; allocated_amount_krw: number } =>
          Boolean(row),
        ),
    [allocationInputs, supplierDebits],
  );

  const allocatedTotal = useMemo(
    () => allocationRows.reduce((sum, row) => sum + row.allocated_amount_krw, 0),
    [allocationRows],
  );

  const unallocatedAmount = totalAmount - allocatedTotal;
  const overAllocated = totalAmount > 0 && allocatedTotal > totalAmount;

  const allocationsJson = useMemo(
    () => JSON.stringify(allocationRows),
    [allocationRows],
  );

  const disabled = suppliers.length === 0 || overAllocated;

  return (
    <form action={formAction} className="rounded-xl border border-line bg-canvas p-3">
      <h3 className="text-sm font-semibold text-text-primary">지급 등록</h3>
      <input type="hidden" name="allocations_json" value={allocationsJson} />

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">공급처</span>
          <select
            name="supplier_id"
            value={supplierId}
            onChange={(event) => {
              const nextSupplier = event.target.value;
              setSupplierId(nextSupplier);
              setAllocationInputs({});
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
            value={totalAmountRaw}
            onChange={(event) => setTotalAmountRaw(event.target.value)}
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

        <div className="rounded-lg border border-line bg-white p-2 md:col-span-2">
          <p className="text-xs font-semibold text-text-secondary">차변 다중 배정 (선택)</p>
          {supplierDebits.length === 0 ? (
            <p className="mt-2 text-xs text-text-secondary">
              선택한 공급처에 배정 가능한 미지급 차변이 없습니다.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {supplierDebits.map((debit) => (
                <li
                  key={debit.id}
                  className="rounded-lg border border-line bg-canvas px-2 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-text-primary">
                      {debit.transaction_date} · {debit.shipment_number ?? "직접거래"}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      원금 {debit.amount_krw.toLocaleString("ko-KR")} / 기배정{" "}
                      {debit.allocated_krw.toLocaleString("ko-KR")} / 잔액{" "}
                      {debit.remaining_krw.toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder={`배정금액 (최대 ${debit.remaining_krw.toLocaleString("ko-KR")})`}
                    value={allocationInputs[debit.id] ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (!raw) {
                        setAllocationInputs((prev) => {
                          const next = { ...prev };
                          delete next[debit.id];
                          return next;
                        });
                        return;
                      }

                      const parsed = Number(raw);
                      if (!Number.isFinite(parsed) || parsed < 0) {
                        return;
                      }

                      const nextValue = Math.min(
                        Math.round(parsed),
                        Math.round(debit.remaining_krw),
                      );

                      setAllocationInputs((prev) => ({
                        ...prev,
                        [debit.id]: String(nextValue),
                      }));
                    }}
                    className="mt-2 h-9 w-full rounded-lg border border-line bg-white px-3 text-sm"
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 grid gap-1 text-xs md:grid-cols-3">
            <p className="text-text-secondary">
              지급금액: {totalAmount.toLocaleString("ko-KR")}
            </p>
            <p className="text-text-secondary">
              배정합계: {allocatedTotal.toLocaleString("ko-KR")}
            </p>
            <p className={overAllocated ? "font-semibold text-warning" : "text-text-secondary"}>
              미배정: {unallocatedAmount.toLocaleString("ko-KR")}
            </p>
          </div>
        </div>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">비고</span>
          <input
            name="notes"
            placeholder="지급 목적 또는 참고사항"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>
      </div>

      {overAllocated ? (
        <p className="mt-3 rounded-xl border border-warning/30 bg-orange-50 px-3 py-2 text-xs text-warning">
          배정 합계가 지급금액을 초과했습니다. 배정 금액을 조정해 주세요.
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
