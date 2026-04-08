"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createShipmentAction,
  type ShipmentFormState,
} from "@/app/(ops)/shipments/actions";

type SupplierOption = {
  id: string;
  code: string;
  name_kr: string;
};

type SpeciesOption = {
  id: string;
  code: string;
  name_kr: string;
};

type AssigneeOption = {
  id: string;
  full_name: string;
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

type ShipmentCreateFormProps = {
  suppliers: SupplierOption[];
  species: SpeciesOption[];
  assignees: AssigneeOption[];
  defaultAssigneeId: string;
};

const initialState: ShipmentFormState = {
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "저장 중..." : "배치 저장"}
    </button>
  );
}

export function ShipmentCreateForm({
  suppliers,
  species,
  assignees,
  defaultAssigneeId,
}: ShipmentCreateFormProps) {
  const [state, formAction] = useActionState(createShipmentAction, initialState);

  const [lineItems, setLineItems] = useState<LineItemInput[]>([
    {
      species_id: species[0]?.id ?? "",
      quantity: "",
      unit_price_jpy: "",
      grade_code: "",
    },
  ]);

  const [costItems, setCostItems] = useState<CostInput[]>([
  ]);

  const disabled =
    suppliers.length === 0 || species.length === 0 || assignees.length === 0;

  const lineItemsJson = useMemo(() => JSON.stringify(lineItems), [lineItems]);
  const costsJson = useMemo(() => JSON.stringify(costItems), [costItems]);

  return (
    <form action={formAction} className="app-card p-4 md:p-5">
      <header className="mb-4 border-b border-line pb-3">
        <h2 className="text-base font-semibold text-text-primary">신규 수입 배치 등록</h2>
        <p className="title-en text-xs">Create Shipment Batch</p>
      </header>

      <input type="hidden" name="line_items_json" value={lineItemsJson} />
      <input type="hidden" name="ancillary_costs_json" value={costsJson} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">공급처</span>
          <select
            name="supplier_id"
            required
            defaultValue={suppliers[0]?.id ?? ""}
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
          <span className="mb-1 block text-xs font-semibold text-text-secondary">구매담당</span>
          <select
            name="assigned_buyer_id"
            required
            defaultValue={defaultAssigneeId || assignees[0]?.id || ""}
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          >
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.full_name || "이름 없음"}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">입고일</span>
          <input
            required
            type="date"
            name="intake_date"
            defaultValue={todayIso()}
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">통관일</span>
          <input
            type="date"
            name="customs_date"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">통관번호</span>
          <input
            name="customs_permit_number"
            placeholder="예: KOR-2026-04-008"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">
            환율 (JPY {"->"} KRW)
          </span>
          <input
            type="number"
            step="0.0001"
            min="0"
            name="fx_rate"
            defaultValue="9.2"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">상태</span>
          <select
            name="status"
            defaultValue="pending_customs"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
          >
            <option value="pending_customs">통관 대기</option>
            <option value="in_tank">보관중</option>
            <option value="partially_sold">부분 판매</option>
            <option value="completed">완료</option>
          </select>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-semibold text-text-secondary">비고</span>
        <textarea
          name="notes"
          rows={2}
          placeholder="배치 특이사항을 기록하세요."
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
        />
      </label>

      <section className="mt-5 rounded-xl border border-line bg-canvas p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">품종 라인</h3>
          <button
            type="button"
            onClick={() =>
              setLineItems((prev) => [
                ...prev,
                {
                  species_id: species[0]?.id ?? "",
                  quantity: "",
                  unit_price_jpy: "",
                  grade_code: "",
                },
              ])
            }
            className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-text-primary"
          >
            + 라인 추가
          </button>
        </div>

        <div className="space-y-2">
          {lineItems.map((item, index) => (
            <div key={`line-${index}`} className="grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto]">
              <select
                value={item.species_id}
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
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              >
                {species.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name_kr} ({sp.code})
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="수량"
                value={item.quantity}
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
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              />

              <input
                type="number"
                min="0"
                step="1"
                placeholder="JPY 단가"
                value={item.unit_price_jpy}
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
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              />

              <input
                placeholder="등급"
                value={item.grade_code}
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
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              />

              <button
                type="button"
                disabled={lineItems.length <= 1}
                onClick={() =>
                  setLineItems((prev) => prev.filter((_, lineIndex) => lineIndex !== index))
                }
                className="h-10 rounded-lg border border-line bg-white px-2 text-xs font-semibold text-text-secondary disabled:opacity-40"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-canvas p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">부대비용</h3>
          <button
            type="button"
            onClick={() =>
              setCostItems((prev) => [
                ...prev,
                {
                  cost_type: "other",
                  amount_krw: "",
                  cost_date: todayIso(),
                  notes: "",
                },
              ])
            }
            className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-text-primary"
          >
            + 비용 추가
          </button>
        </div>

        {costItems.length === 0 ? (
          <p className="rounded-lg border border-line bg-white px-3 py-3 text-xs text-text-secondary">
            등록할 부대비용이 있다면 비용 추가 버튼을 눌러 입력해 주세요.
          </p>
        ) : (
          <div className="space-y-2">
            {costItems.map((item, index) => (
            <div key={`cost-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
              <select
                value={item.cost_type}
                onChange={(event) =>
                  setCostItems((prev) =>
                    prev.map((cost, costIndex) =>
                      costIndex === index
                        ? {
                            ...cost,
                            cost_type: event.target.value,
                          }
                        : cost,
                    ),
                  )
                }
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              >
                {costTypeLabels.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0"
                step="1"
                placeholder="금액 KRW"
                value={item.amount_krw}
                onChange={(event) =>
                  setCostItems((prev) =>
                    prev.map((cost, costIndex) =>
                      costIndex === index
                        ? {
                            ...cost,
                            amount_krw: event.target.value,
                          }
                        : cost,
                    ),
                  )
                }
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              />

              <input
                type="date"
                value={item.cost_date}
                onChange={(event) =>
                  setCostItems((prev) =>
                    prev.map((cost, costIndex) =>
                      costIndex === index
                        ? {
                            ...cost,
                            cost_date: event.target.value,
                          }
                        : cost,
                    ),
                  )
                }
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              />

              <input
                placeholder="비고"
                value={item.notes}
                onChange={(event) =>
                  setCostItems((prev) =>
                    prev.map((cost, costIndex) =>
                      costIndex === index
                        ? {
                            ...cost,
                            notes: event.target.value,
                          }
                        : cost,
                    ),
                  )
                }
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
              />

              <button
                type="button"
                onClick={() =>
                  setCostItems((prev) => prev.filter((_, costIndex) => costIndex !== index))
                }
                className="h-10 rounded-lg border border-line bg-white px-2 text-xs font-semibold text-text-secondary"
              >
                삭제
              </button>
            </div>
            ))}
          </div>
        )}
      </section>

      {state.error ? (
        <p className="mt-4 rounded-xl border border-warning/30 bg-orange-50 px-3 py-2 text-sm text-warning">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="mt-4 rounded-xl border border-accent/30 bg-emerald-50 px-3 py-2 text-sm text-accent-strong">
          {state.success}
        </p>
      ) : null}

      {disabled ? (
        <p className="mt-4 text-sm text-warning">
          배치 등록을 위해 기준정보(공급처/품종)와 구매담당 사용자를 확인해 주세요.
        </p>
      ) : null}

      <div className="mt-5 flex justify-end">
        <SubmitButton disabled={disabled} />
      </div>
    </form>
  );
}
