import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { canWriteShipments, type AppRole, requireUser } from "@/lib/auth";
import { formatKrw, formatPercent } from "@/lib/format";
import { ShipmentCreateForm } from "@/app/(ops)/shipments/shipment-create-form";
import { ShipmentStatusForm } from "@/app/(ops)/shipments/shipment-status-form";

type ShipmentsPageProps = {
  searchParams: Promise<{ id?: string | string[] }>;
};

type SupplierRef = {
  code: string;
  name_kr: string;
};

const statusLabelKo: Record<string, string> = {
  pending_customs: "통관 대기",
  in_tank: "보관중",
  partially_sold: "부분 판매",
  completed: "완료",
};

const costTypeLabelKo: Record<string, string> = {
  tank_fee: "수조 보관비",
  day_labor_intake: "상하차 인건비",
  domestic_freight: "국내 운송비",
  customs_fee: "통관 수수료",
  extra_inspection: "추가 검사비",
  net_cost: "망비",
  travel_expense: "출장비",
  day_labor_management: "관리 인건비",
  liquid_oxygen: "액체산소",
  other: "기타",
};

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return value;
}

function getSupplierRef(value: unknown): SupplierRef | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const first = value[0];
    if (!first || typeof first !== "object") return null;
    return {
      code: String((first as { code?: unknown }).code ?? ""),
      name_kr: String((first as { name_kr?: unknown }).name_kr ?? ""),
    };
  }

  return {
    code: String((value as { code?: unknown }).code ?? ""),
    name_kr: String((value as { name_kr?: unknown }).name_kr ?? ""),
  };
}

function normalizeShipmentStatus(value: string) {
  if (value === "pending_customs") return "pending_customs" as const;
  if (value === "in_tank") return "in_tank" as const;
  if (value === "partially_sold") return "partially_sold" as const;
  if (value === "completed") return "completed" as const;
  return "pending_customs" as const;
}

export default async function ShipmentsPage({ searchParams }: ShipmentsPageProps) {
  const { supabase, user } = await requireUser();
  const params = await searchParams;
  const selectedId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : null;

  const [profileResult, suppliersResult, speciesResult, shipmentsResult, financialResult] =
    await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase
        .from("suppliers")
        .select("id, code, name_kr")
        .eq("is_active", true)
        .order("code", { ascending: true }),
      supabase
        .from("species")
        .select("id, code, name_kr")
        .eq("is_active", true)
        .order("code", { ascending: true }),
      supabase
        .from("shipments")
        .select(
          "id, shipment_number, supplier_id, intake_date, customs_date, customs_permit_number, fx_rate, status, notes, suppliers(code, name_kr)",
        )
        .order("intake_date", { ascending: false })
        .limit(40),
      supabase
        .from("shipment_financial_summary")
        .select("shipment_id, total_cost_krw, sales_krw, net_profit_krw, net_margin_pct"),
    ]);

  const role = (profileResult.data?.role as AppRole | null) ?? "admin";
  const writable = canWriteShipments(role);

  const suppliers = suppliersResult.data ?? [];
  const species = speciesResult.data ?? [];
  const shipments = shipmentsResult.data ?? [];
  const financialMap = new Map(
    (financialResult.data ?? []).map((row) => [row.shipment_id, row]),
  );

  const activeCount = shipments.filter((row) => row.status !== "completed").length;
  const pendingCount = shipments.filter((row) => row.status === "pending_customs").length;

  const selectedShipment =
    shipments.find((row) => row.id === selectedId) ?? shipments.at(0) ?? null;

  const selectedFinancial = selectedShipment
    ? financialMap.get(selectedShipment.id) ?? null
    : null;

  const [lineItemsResult, costsResult, inventorySummaryResult] = selectedShipment
    ? await Promise.all([
        supabase
          .from("shipment_line_items")
          .select(
            "id, quantity, unit_price_jpy, total_jpy, grade_code, species(code, name_kr)",
          )
          .eq("shipment_id", selectedShipment.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("ancillary_costs")
          .select("id, cost_type, amount_krw, cost_date, notes")
          .eq("shipment_id", selectedShipment.id)
          .order("cost_date", { ascending: true }),
        supabase
          .from("shipment_inventory_summary")
          .select("intake_qty, sold_qty, mortality_qty, remaining_qty")
          .eq("shipment_id", selectedShipment.id)
          .maybeSingle(),
      ])
    : [null, null, null];

  const lineItems = lineItemsResult?.data ?? [];
  const costs = costsResult?.data ?? [];
  const inventorySummary = inventorySummaryResult?.data ?? null;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">전체 배치</p>
          <p className="mt-2 text-2xl font-semibold text-accent-strong">
            {shipments.length.toLocaleString("ko-KR")}건
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">활성 배치</p>
          <p className="mt-2 text-2xl font-semibold text-accent-strong">
            {activeCount.toLocaleString("ko-KR")}건
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">통관 대기</p>
          <p className="mt-2 text-2xl font-semibold text-warning">
            {pendingCount.toLocaleString("ko-KR")}건
          </p>
        </div>
      </section>

      {writable ? (
        <ShipmentCreateForm
          suppliers={suppliers.map((row) => ({
            id: row.id,
            code: row.code,
            name_kr: row.name_kr,
          }))}
          species={species.map((row) => ({
            id: row.id,
            code: row.code,
            name_kr: row.name_kr,
          }))}
        />
      ) : (
        <SectionCard titleKo="권한 안내" titleEn="Permission Notice">
          <p className="text-sm text-text-secondary">
            현재 역할은 배치 등록 권한이 없습니다. 관리자 또는 수입 담당 권한이
            필요합니다.
          </p>
        </SectionCard>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <SectionCard titleKo="수입 배치 목록" titleEn="Shipment Registry">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th className="px-2 py-2">배치번호</th>
                  <th className="px-2 py-2">공급처</th>
                  <th className="px-2 py-2">입고일</th>
                  <th className="px-2 py-2">상태</th>
                  <th className="px-2 py-2">총원가</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((row) => {
                  const supplier = getSupplierRef(row.suppliers);
                  const financial = financialMap.get(row.id);
                  const active = selectedShipment?.id === row.id;

                  return (
                    <tr key={row.id} className="border-t border-line/70 text-text-primary">
                      <td className="px-2 py-2 font-semibold">
                        <Link
                          href={`/shipments?id=${row.id}`}
                          className={`rounded px-1 py-0.5 ${
                            active ? "bg-surface-strong" : "hover:bg-surface-strong"
                          }`}
                        >
                          {row.shipment_number}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{supplier?.name_kr ?? "-"}</td>
                      <td className="px-2 py-2">{formatDate(row.intake_date)}</td>
                      <td className="px-2 py-2">{statusLabelKo[row.status] ?? row.status}</td>
                      <td className="px-2 py-2">
                        {formatKrw(toNumber(financial?.total_cost_krw))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard titleKo="배치 상세" titleEn="Shipment Details">
          {!selectedShipment ? (
            <p className="text-sm text-text-secondary">등록된 배치가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-canvas p-3">
                <p className="text-xs text-text-secondary">배치번호</p>
                <p className="text-lg font-semibold text-text-primary">
                  {selectedShipment.shipment_number}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  상태: {statusLabelKo[selectedShipment.status] ?? selectedShipment.status}
                </p>

                {writable ? (
                  <ShipmentStatusForm
                    shipmentId={selectedShipment.id}
                    currentStatus={normalizeShipmentStatus(selectedShipment.status)}
                  />
                ) : null}
              </div>

              <div className="grid gap-2 text-xs md:grid-cols-2 md:text-sm">
                <p className="rounded-lg border border-line bg-canvas px-3 py-2">
                  입고일: {formatDate(selectedShipment.intake_date)}
                </p>
                <p className="rounded-lg border border-line bg-canvas px-3 py-2">
                  통관일: {formatDate(selectedShipment.customs_date)}
                </p>
                <p className="rounded-lg border border-line bg-canvas px-3 py-2">
                  통관번호: {selectedShipment.customs_permit_number ?? "-"}
                </p>
                <p className="rounded-lg border border-line bg-canvas px-3 py-2">
                  환율: {selectedShipment.fx_rate ? selectedShipment.fx_rate : "-"}
                </p>
              </div>

              <div className="rounded-xl border border-line bg-canvas p-3">
                <p className="text-xs font-semibold text-text-secondary">손익 요약</p>
                <div className="mt-2 grid gap-2 text-xs md:grid-cols-2 md:text-sm">
                  <p>총원가: {formatKrw(toNumber(selectedFinancial?.total_cost_krw))}</p>
                  <p>매출: {formatKrw(toNumber(selectedFinancial?.sales_krw))}</p>
                  <p>
                    순이익: {formatKrw(toNumber(selectedFinancial?.net_profit_krw))}
                  </p>
                  <p>
                    순이익률:{" "}
                    {selectedFinancial?.net_margin_pct === null ||
                    selectedFinancial?.net_margin_pct === undefined
                      ? "-"
                      : formatPercent(toNumber(selectedFinancial.net_margin_pct))}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-canvas p-3">
                <p className="text-xs font-semibold text-text-secondary">재고 요약</p>
                <div className="mt-2 grid gap-2 text-xs md:grid-cols-2 md:text-sm">
                  <p>입고: {toNumber(inventorySummary?.intake_qty).toLocaleString("ko-KR")}</p>
                  <p>판매: {toNumber(inventorySummary?.sold_qty).toLocaleString("ko-KR")}</p>
                  <p>폐사: {toNumber(inventorySummary?.mortality_qty).toLocaleString("ko-KR")}</p>
                  <p>
                    잔량: {toNumber(inventorySummary?.remaining_qty).toLocaleString("ko-KR")}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-canvas p-3">
                <p className="mb-2 text-xs font-semibold text-text-secondary">품종 라인</p>
                <ul className="space-y-2 text-xs md:text-sm">
                  {lineItems.map((line) => {
                    const speciesRef = getSupplierRef(line.species);
                    return (
                      <li key={line.id} className="rounded-lg border border-line bg-white px-3 py-2">
                        <p className="font-semibold text-text-primary">
                          {speciesRef?.name_kr ?? "-"} ({speciesRef?.code ?? "-"})
                        </p>
                        <p className="text-text-secondary">
                          수량 {toNumber(line.quantity).toLocaleString("ko-KR")} · JPY 단가 {toNumber(
                            line.unit_price_jpy,
                          ).toLocaleString("ko-KR")} · 합계 {toNumber(line.total_jpy).toLocaleString("ko-KR")}
                          {line.grade_code ? ` · 등급 ${line.grade_code}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="rounded-xl border border-line bg-canvas p-3">
                <p className="mb-2 text-xs font-semibold text-text-secondary">부대비용</p>
                <ul className="space-y-2 text-xs md:text-sm">
                  {costs.length === 0 ? (
                    <li className="rounded-lg border border-line bg-white px-3 py-2 text-text-secondary">
                      등록된 부대비용이 없습니다.
                    </li>
                  ) : (
                    costs.map((cost) => (
                      <li key={cost.id} className="rounded-lg border border-line bg-white px-3 py-2">
                        <p className="font-semibold text-text-primary">
                          {costTypeLabelKo[cost.cost_type] ?? cost.cost_type}
                        </p>
                        <p className="text-text-secondary">
                          {formatDate(cost.cost_date)} · {formatKrw(toNumber(cost.amount_krw))}
                          {cost.notes ? ` · ${cost.notes}` : ""}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}
        </SectionCard>
      </section>
    </div>
  );
}
