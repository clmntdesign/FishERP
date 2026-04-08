"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createSaleAction,
  type SaleCreateFormState,
} from "@/app/(ops)/sales/actions";

export type SaleStockOption = {
  shipment_id: string;
  shipment_number: string;
  species_id: string;
  species_code: string;
  species_name_kr: string;
  remaining_qty: number;
};

type BuyerOption = {
  id: string;
  code: string;
  name: string;
};

type SaleCreateFormProps = {
  stockOptions: SaleStockOption[];
  buyers: BuyerOption[];
};

const initialState: SaleCreateFormState = {
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
      {pending ? "저장 중..." : "판매 등록"}
    </button>
  );
}

export function SaleCreateForm({ stockOptions, buyers }: SaleCreateFormProps) {
  const [state, formAction] = useActionState(createSaleAction, initialState);

  const shipmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of stockOptions) {
      if (!map.has(row.shipment_id)) {
        map.set(row.shipment_id, row.shipment_number);
      }
    }
    return Array.from(map.entries()).map(([id, shipment_number]) => ({
      id,
      shipment_number,
    }));
  }, [stockOptions]);

  const [shipmentId, setShipmentId] = useState(shipmentOptions[0]?.id ?? "");

  const speciesOptions = useMemo(
    () => stockOptions.filter((row) => row.shipment_id === shipmentId),
    [stockOptions, shipmentId],
  );

  const [speciesId, setSpeciesId] = useState(speciesOptions[0]?.species_id ?? "");

  const selectedStock =
    speciesOptions.find((row) => row.species_id === speciesId) ?? speciesOptions[0] ?? null;

  const disabled = stockOptions.length === 0 || buyers.length === 0;

  return (
    <form action={formAction} className="rounded-xl border border-line bg-canvas p-3">
      <h3 className="text-sm font-semibold text-text-primary">출하 판매 등록</h3>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">배치</span>
          <select
            name="shipment_id"
            value={shipmentId}
            onChange={(event) => {
              const nextShipment = event.target.value;
              setShipmentId(nextShipment);
              const nextSpecies = stockOptions.find((row) => row.shipment_id === nextShipment);
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
          <span className="mb-1 block text-xs font-semibold text-text-secondary">거래처</span>
          <select
            name="buyer_id"
            defaultValue={buyers[0]?.id ?? ""}
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          >
            {buyers.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>
                {buyer.name} ({buyer.code})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">출하일</span>
          <input
            type="date"
            name="dispatch_date"
            defaultValue={todayIso()}
            required
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">수량</span>
          <input
            type="number"
            name="quantity"
            min="0"
            step="0.01"
            required
            placeholder="예: 120"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">단가 (KRW)</span>
          <input
            type="number"
            name="unit_price_krw"
            min="0"
            step="1"
            required
            placeholder="예: 16500"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">
            입금 예정일
          </span>
          <input
            type="date"
            name="expected_payment_date"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">비고</span>
          <input
            name="notes"
            placeholder="출하/판매 특이사항"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-text-secondary">
        현재 가용 잔량: {selectedStock ? selectedStock.remaining_qty.toLocaleString("ko-KR") : "0"}
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
