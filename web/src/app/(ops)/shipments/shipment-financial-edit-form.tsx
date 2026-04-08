"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateShipmentFinancialInputsAction,
  type ShipmentFinancialFormState,
} from "@/app/(ops)/shipments/actions";

type SpeciesOption = {
  id: string;
  code: string;
  name_kr: string;
};

type InitialLineItem = {
  species_id: string;
  quantity: number;
  unit_price_jpy: number;
  grade_code: string | null;
};

type InitialCostItem = {
  cost_type: string;
  amount_krw: number;
  cost_date: string;
  notes: string | null;
};

type LineItemInput = {
  species_id: string;
  quantity: string;
  unit_price_jpy: string;
  grade_code: string;
};

type CostInput = {
  cost_type: string;
  amount_krw: string;
  cost_date: string;
  notes: string;
};

type ShipmentFinancialEditFormProps = {
  shipmentId: string;
  status: "pending_customs" | "in_tank" | "partially_sold" | "completed";
  speciesOptions: SpeciesOption[];
  initialLineItems: InitialLineItem[];
  initialCosts: InitialCostItem[];
};

const initialState: ShipmentFinancialFormState = {
  error: null,
  success: null,
};

const costTypeLabels: Array<{ value: string; label: string }> = [
  { value: "customs_fee", label: "통관 수수료" },
  { value: "domestic_freight", label: "국내 운송비" },
  { value: "tank_fee", label: "수조 보관비" },
  { value: "day_labor_intake", label: "상하차 인건비" },
  { value: "day_labor_management", label: "관리 인건비" },
  { value: "extra_inspection", label: "추가 검사비" },
  { value: "liquid_oxygen", label: "액체산소" },
  { value: "travel_expense", label: "출장비" },
  { value: "net_cost", label: "망비" },
  { value: "other", label: "기타" },
];

function defaultLine(speciesOptions: SpeciesOption[]): LineItemInput {
  return {
    species_id: speciesOptions[0]?.id ?? "",
    quantity: "",
    unit_price_jpy: "",
    grade_code: "",
  };
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="h-9 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "갱신 중..." : "라인/부대비용 저장"}
    </button>
  );
}

export function ShipmentFinancialEditForm({
  shipmentId,
  status,
  speciesOptions,
  initialLineItems,
  initialCosts,
}: ShipmentFinancialEditFormProps) {
  const [state, formAction] = useActionState(updateShipmentFinancialInputsAction, initialState);

  const [lineItems, setLineItems] = useState<LineItemInput[]>(() => {
    if (initialLineItems.length === 0) {
      return [defaultLine(speciesOptions)];
    }

    return initialLineItems.map((row) => ({
      species_id: row.species_id,
      quantity: String(row.quantity),
      unit_price_jpy: String(row.unit_price_jpy),
      grade_code: row.grade_code ?? "",
    }));
  });

  const [costItems, setCostItems] = useState<CostInput[]>(() =>
    initialCosts.map((row) => ({
      cost_type: row.cost_type,
      amount_krw: String(row.amount_krw),
      cost_date: row.cost_date,
      notes: row.notes ?? "",
    })),
  );

  const lineItemsJson = useMemo(() => JSON.stringify(lineItems), [lineItems]);
  const costsJson = useMemo(() => JSON.stringify(costItems), [costItems]);

  const editable = status === "pending_customs";
  const disabled = !editable || speciesOptions.length === 0;

  return (
    <form action={formAction} className="mt-3 rounded-xl border border-line bg-canvas p-3">
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <input type="hidden" name="line_items_json" value={lineItemsJson} />
      <input type="hidden" name="ancillary_costs_json" value={costsJson} />

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text-secondary">라인/부대비용 수정</p>
      </div>

      <section className="mt-2 rounded-lg border border-line bg-white p-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-text-primary">품종 라인</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setLineItems((prev) => [...prev, defaultLine(speciesOptions)])}
            className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            + 라인 추가
          </button>
        </div>

        <div className="space-y-2">
          {lineItems.map((item, index) => (
            <div
              key={`edit-line-${index}`}
              className="grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto]"
            >
              <select
                value={item.species_id}
                disabled={disabled}
                onChange={(event) =>
                  setLineItems((prev) =>
                    prev.map((line, lineIndex) =>
                      lineIndex === index
                        ? {
                            ...line,
                            species_id: event.target.value,
                          }
                        : line,
                    ),
                  )
                }
                className="h-9 rounded-md border border-line bg-white px-2 text-xs disabled:bg-surface"
              >
                {speciesOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name_kr} ({option.code})
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="수량"
                value={item.quantity}
                disabled={disabled}
                onChange={(event) =>
                  setLineItems((prev) =>
                    prev.map((line, lineIndex) =>
                      lineIndex === index
                        ? {
                            ...line,
                            quantity: event.target.value,
                          }
                        : line,
                    ),
                  )
                }
                className="h-9 rounded-md border border-line bg-white px-2 text-xs disabled:bg-surface"
              />

              <input
                type="number"
                min="0"
                step="1"
                placeholder="JPY 단가"
                value={item.unit_price_jpy}
                disabled={disabled}
                onChange={(event) =>
                  setLineItems((prev) =>
                    prev.map((line, lineIndex) =>
                      lineIndex === index
                        ? {
                            ...line,
                            unit_price_jpy: event.target.value,
                          }
                        : line,
                    ),
                  )
                }
                className="h-9 rounded-md border border-line bg-white px-2 text-xs disabled:bg-surface"
              />

              <input
                placeholder="등급"
                value={item.grade_code}
                disabled={disabled}
                onChange={(event) =>
                  setLineItems((prev) =>
                    prev.map((line, lineIndex) =>
                      lineIndex === index
                        ? {
                            ...line,
                            grade_code: event.target.value,
                          }
                        : line,
                    ),
                  )
                }
                className="h-9 rounded-md border border-line bg-white px-2 text-xs disabled:bg-surface"
              />

              <button
                type="button"
                disabled={disabled || lineItems.length <= 1}
                onClick={() =>
                  setLineItems((prev) => prev.filter((_, lineIndex) => lineIndex !== index))
                }
                className="h-9 rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-warning disabled:cursor-not-allowed disabled:opacity-60"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-3 rounded-lg border border-line bg-white p-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-text-primary">부대비용</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              setCostItems((prev) => [
                ...prev,
                {
                  cost_type: "customs_fee",
                  amount_krw: "",
                  cost_date: "",
                  notes: "",
                },
              ])
            }
            className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            + 비용 추가
          </button>
        </div>

        <div className="space-y-2">
          {costItems.length === 0 ? (
            <p className="text-xs text-text-secondary">등록된 부대비용이 없습니다.</p>
          ) : (
            costItems.map((cost, index) => (
              <div
                key={`edit-cost-${index}`}
                className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
              >
                <select
                  value={cost.cost_type}
                  disabled={disabled}
                  onChange={(event) =>
                    setCostItems((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              cost_type: event.target.value,
                            }
                          : row,
                      ),
                    )
                  }
                  className="h-9 rounded-md border border-line bg-white px-2 text-xs disabled:bg-surface"
                >
                  {costTypeLabels.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="금액(KRW)"
                  value={cost.amount_krw}
                  disabled={disabled}
                  onChange={(event) =>
                    setCostItems((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              amount_krw: event.target.value,
                            }
                          : row,
                      ),
                    )
                  }
                  className="h-9 rounded-md border border-line bg-white px-2 text-xs disabled:bg-surface"
                />

                <input
                  type="date"
                  value={cost.cost_date}
                  disabled={disabled}
                  onChange={(event) =>
                    setCostItems((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              cost_date: event.target.value,
                            }
                          : row,
                      ),
                    )
                  }
                  className="h-9 rounded-md border border-line bg-white px-2 text-xs disabled:bg-surface"
                />

                <input
                  placeholder="비고"
                  value={cost.notes}
                  disabled={disabled}
                  onChange={(event) =>
                    setCostItems((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              notes: event.target.value,
                            }
                          : row,
                      ),
                    )
                  }
                  className="h-9 rounded-md border border-line bg-white px-2 text-xs disabled:bg-surface"
                />

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setCostItems((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
                  }
                  className="h-9 rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-warning disabled:cursor-not-allowed disabled:opacity-60"
                >
                  삭제
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {!editable ? (
        <p className="mt-2 text-[11px] text-text-secondary">
          보관중(in_tank) 이후 상태에서는 품종 라인과 부대비용을 수정할 수 없습니다.
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
        <SubmitButton disabled={disabled} />
      </div>
    </form>
  );
}
