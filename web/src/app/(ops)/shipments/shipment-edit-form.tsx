"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateShipmentHeaderAction,
  type ShipmentHeaderFormState,
} from "@/app/(ops)/shipments/actions";

type AssigneeOption = {
  id: string;
  full_name: string;
};

type ShipmentEditFormProps = {
  shipmentId: string;
  status: "pending_customs" | "in_tank" | "partially_sold" | "completed";
  assignedBuyerId: string | null;
  customsDate: string | null;
  customsPermitNumber: string | null;
  fxRate: number | null;
  notes: string | null;
  assignees: AssigneeOption[];
};

const initialState: ShipmentHeaderFormState = {
  error: null,
  success: null,
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="h-9 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "수정 중..." : "기본정보 저장"}
    </button>
  );
}

export function ShipmentEditForm({
  shipmentId,
  status,
  assignedBuyerId,
  customsDate,
  customsPermitNumber,
  fxRate,
  notes,
  assignees,
}: ShipmentEditFormProps) {
  const [state, formAction] = useActionState(updateShipmentHeaderAction, initialState);

  const fxEditable = status === "pending_customs";

  return (
    <form action={formAction} className="mt-3 rounded-xl border border-line bg-canvas p-3">
      <input type="hidden" name="shipment_id" value={shipmentId} />

      <p className="mb-2 text-xs font-semibold text-text-secondary">기본정보 수정</p>

      <div className="grid gap-2 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">구매담당</span>
          <select
            name="assigned_buyer_id"
            required
            defaultValue={assignedBuyerId ?? assignees[0]?.id ?? ""}
            className="h-9 w-full rounded-lg border border-line bg-white px-3 text-xs"
          >
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.full_name || "이름 없음"}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">통관일</span>
          <input
            type="date"
            name="customs_date"
            defaultValue={customsDate ?? ""}
            className="h-9 w-full rounded-lg border border-line bg-white px-3 text-xs"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">통관번호</span>
          <input
            name="customs_permit_number"
            defaultValue={customsPermitNumber ?? ""}
            placeholder="예: KOR-2026-04-008"
            className="h-9 w-full rounded-lg border border-line bg-white px-3 text-xs"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">환율 (JPY -&gt; KRW)</span>
          <input
            type="number"
            name="fx_rate"
            min="0"
            step="0.0001"
            defaultValue={fxRate ?? ""}
            disabled={!fxEditable}
            className="h-9 w-full rounded-lg border border-line bg-white px-3 text-xs disabled:bg-surface"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">비고</span>
          <input
            name="notes"
            defaultValue={notes ?? ""}
            placeholder="배치 특이사항"
            className="h-9 w-full rounded-lg border border-line bg-white px-3 text-xs"
          />
        </label>
      </div>

      {!fxEditable ? (
        <p className="mt-2 text-[11px] text-text-secondary">
          보관중(in_tank) 이후 상태에서는 환율을 변경할 수 없습니다.
        </p>
      ) : null}

      {state.error ? (
        <p className="mt-2 rounded-md border border-warning/30 bg-orange-50 px-2 py-1 text-xs text-warning">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="mt-2 rounded-md border border-accent/30 bg-emerald-50 px-2 py-1 text-xs text-accent-strong">
          {state.success}
        </p>
      ) : null}

      <div className="mt-2 flex justify-end">
        <SubmitButton disabled={assignees.length === 0} />
      </div>
    </form>
  );
}
