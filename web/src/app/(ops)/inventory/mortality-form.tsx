"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  recordMortalityAction,
  type MortalityFormState,
} from "@/app/(ops)/inventory/actions";

export type InventoryStockRow = {
  shipment_id: string;
  shipment_number: string;
  species_id: string;
  species_code: string;
  species_name_kr: string;
  remaining_qty: number;
};

type MortalityFormProps = {
  stockRows: InventoryStockRow[];
};

const initialState: MortalityFormState = {
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
      {pending ? "기록 중..." : "폐사 기록 저장"}
    </button>
  );
}

export function MortalityForm({ stockRows }: MortalityFormProps) {
  const [state, formAction] = useActionState(recordMortalityAction, initialState);

  const shipmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of stockRows) {
      if (!map.has(row.shipment_id)) {
        map.set(row.shipment_id, row.shipment_number);
      }
    }
    return Array.from(map.entries()).map(([id, shipment_number]) => ({
      id,
      shipment_number,
    }));
  }, [stockRows]);

  const [shipmentId, setShipmentId] = useState(shipmentOptions[0]?.id ?? "");

  const speciesOptions = useMemo(
    () => stockRows.filter((row) => row.shipment_id === shipmentId),
    [stockRows, shipmentId],
  );

  const [speciesId, setSpeciesId] = useState(speciesOptions[0]?.species_id ?? "");

  const selectedSpecies =
    speciesOptions.find((row) => row.species_id === speciesId) ?? speciesOptions[0] ?? null;

  const disabled = stockRows.length === 0 || !shipmentId || !speciesId;

  return (
    <form action={formAction} className="rounded-xl border border-line bg-canvas p-3">
      <h3 className="text-sm font-semibold text-text-primary">폐사 기록 등록</h3>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">배치</span>
          <select
            name="shipment_id"
            value={shipmentId}
            onChange={(event) => {
              const nextShipmentId = event.target.value;
              setShipmentId(nextShipmentId);

              const nextSpecies = stockRows.find(
                (row) => row.shipment_id === nextShipmentId,
              );
              setSpeciesId(nextSpecies?.species_id ?? "");
            }}
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          >
            {shipmentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.shipment_number}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">품종</span>
          <select
            name="species_id"
            value={speciesId}
            onChange={(event) => setSpeciesId(event.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          >
            {speciesOptions.map((option) => (
              <option key={`${option.shipment_id}-${option.species_id}`} value={option.species_id}>
                {option.species_name_kr} ({option.species_code})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">기록일</span>
          <input
            name="recorded_date"
            type="date"
            defaultValue={todayIso()}
            required
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">수량</span>
          <input
            name="quantity"
            type="number"
            min="0"
            step="0.01"
            required
            placeholder="예: 12"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">원인</span>
          <select
            name="cause"
            defaultValue="unknown"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          >
            <option value="transit">운송 스트레스</option>
            <option value="disease">질병</option>
            <option value="equipment">설비 문제</option>
            <option value="unknown">미상</option>
          </select>
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">비고</span>
          <input
            name="notes"
            placeholder="폐사 원인 또는 조치사항"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-text-secondary">
        현재 잔량: {selectedSpecies ? selectedSpecies.remaining_qty.toLocaleString("ko-KR") : "0"}
      </p>

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
