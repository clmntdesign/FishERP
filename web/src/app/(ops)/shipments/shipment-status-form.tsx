"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateShipmentStatusAction,
  type ShipmentStatusFormState,
} from "@/app/(ops)/shipments/actions";

type ShipmentStatusFormProps = {
  shipmentId: string;
  currentStatus: "pending_customs" | "in_tank" | "partially_sold" | "completed";
};

const initialState: ShipmentStatusFormState = {
  error: null,
  success: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "변경 중..." : "상태 변경"}
    </button>
  );
}

export function ShipmentStatusForm({ shipmentId, currentStatus }: ShipmentStatusFormProps) {
  const [state, formAction] = useActionState(updateShipmentStatusAction, initialState);

  return (
    <form action={formAction} className="mt-3 rounded-xl border border-line bg-canvas p-3">
      <input type="hidden" name="shipment_id" value={shipmentId} />

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-text-secondary">상태 업데이트</span>
        <select
          name="status"
          defaultValue={currentStatus}
          className="h-9 w-full rounded-lg border border-line bg-white px-3 text-xs"
        >
          <option value="pending_customs">통관 대기</option>
          <option value="in_tank">보관중 (입고 확정)</option>
          <option value="partially_sold">부분 판매</option>
          <option value="completed">완료</option>
        </select>
      </label>

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
        <SubmitButton />
      </div>
    </form>
  );
}
