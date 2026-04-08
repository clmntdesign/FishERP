import { SectionCard } from "@/components/section-card";
import { canWriteInventory, type AppRole, requireUser } from "@/lib/auth";
import {
  MortalityForm,
  type InventoryStockRow,
} from "@/app/(ops)/inventory/mortality-form";

type InventorySummaryRow = {
  shipment_id: string;
  shipment_number: string;
  status: string;
  intake_date: string;
  species_id: string;
  species_code: string;
  species_name_kr: string;
  intake_qty: number;
  sold_qty: number;
  mortality_qty: number;
  remaining_qty: number;
};

type RelationRef = {
  shipment_number?: string;
  code?: string;
  name_kr?: string;
};

const statusLabelKo: Record<string, string> = {
  pending_customs: "통관 대기",
  in_tank: "보관중",
  partially_sold: "부분 판매",
  completed: "완료",
};

const causeLabelKo: Record<string, string> = {
  transit: "운송 스트레스",
  disease: "질병",
  equipment: "설비 문제",
  unknown: "미상",
};

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getRelationRef(value: unknown): RelationRef | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    const first = value[0];
    if (!first || typeof first !== "object") return null;
    return first as RelationRef;
  }

  return value as RelationRef;
}

export default async function InventoryPage() {
  const { supabase, user } = await requireUser();

  const [profileResult, summaryResult, mortalityResult] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("shipment_species_inventory_summary")
      .select(
        "shipment_id, shipment_number, status, intake_date, species_id, species_code, species_name_kr, intake_qty, sold_qty, mortality_qty, remaining_qty",
      )
      .order("intake_date", { ascending: false }),
    supabase
      .from("mortality_records")
      .select(
        "id, recorded_date, quantity, cause, notes, shipments(shipment_number), species(code, name_kr)",
      )
      .order("recorded_date", { ascending: false })
      .limit(20),
  ]);

  const role = (profileResult.data?.role as AppRole | null) ?? "admin";
  const writable = canWriteInventory(role);

  const summaryRows = (summaryResult.data ?? []).map((row) => ({
    shipment_id: row.shipment_id,
    shipment_number: row.shipment_number,
    status: row.status,
    intake_date: row.intake_date,
    species_id: row.species_id,
    species_code: row.species_code,
    species_name_kr: row.species_name_kr,
    intake_qty: toNumber(row.intake_qty),
    sold_qty: toNumber(row.sold_qty),
    mortality_qty: toNumber(row.mortality_qty),
    remaining_qty: toNumber(row.remaining_qty),
  })) as InventorySummaryRow[];

  const stockRowsForForm = summaryRows
    .filter(
      (row) =>
        row.remaining_qty > 0 &&
        (row.status === "in_tank" || row.status === "partially_sold"),
    )
    .map((row) => ({
      shipment_id: row.shipment_id,
      shipment_number: row.shipment_number,
      species_id: row.species_id,
      species_code: row.species_code,
      species_name_kr: row.species_name_kr,
      remaining_qty: row.remaining_qty,
    })) as InventoryStockRow[];

  const totalIntake = summaryRows.reduce((sum, row) => sum + row.intake_qty, 0);
  const totalSold = summaryRows.reduce((sum, row) => sum + row.sold_qty, 0);
  const totalMortality = summaryRows.reduce((sum, row) => sum + row.mortality_qty, 0);
  const totalRemaining = summaryRows.reduce((sum, row) => sum + row.remaining_qty, 0);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">총 입고</p>
          <p className="mt-2 text-2xl font-semibold text-accent-strong">
            {totalIntake.toLocaleString("ko-KR")}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">총 판매</p>
          <p className="mt-2 text-2xl font-semibold text-accent-strong">
            {totalSold.toLocaleString("ko-KR")}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">총 폐사</p>
          <p className="mt-2 text-2xl font-semibold text-warning">
            {totalMortality.toLocaleString("ko-KR")}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">현재 잔량</p>
          <p className="mt-2 text-2xl font-semibold text-accent-strong">
            {totalRemaining.toLocaleString("ko-KR")}
          </p>
        </div>
      </section>

      {writable ? (
        <MortalityForm stockRows={stockRowsForForm} />
      ) : (
        <SectionCard titleKo="권한 안내" titleEn="Permission Notice">
          <p className="text-sm text-text-secondary">
            현재 계정은 재고/폐사 입력 권한이 없습니다.
          </p>
        </SectionCard>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <SectionCard titleKo="배치별 재고" titleEn="Stock by Shipment and Species">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th className="px-2 py-2">배치</th>
                  <th className="px-2 py-2">품종</th>
                  <th className="px-2 py-2">상태</th>
                  <th className="px-2 py-2">입고</th>
                  <th className="px-2 py-2">판매</th>
                  <th className="px-2 py-2">폐사</th>
                  <th className="px-2 py-2">잔량</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row) => (
                  <tr
                    key={`${row.shipment_id}-${row.species_id}`}
                    className="border-t border-line/70 text-text-primary"
                  >
                    <td className="px-2 py-2 font-semibold">{row.shipment_number}</td>
                    <td className="px-2 py-2">
                      {row.species_name_kr} ({row.species_code})
                    </td>
                    <td className="px-2 py-2">{statusLabelKo[row.status] ?? row.status}</td>
                    <td className="px-2 py-2">{row.intake_qty.toLocaleString("ko-KR")}</td>
                    <td className="px-2 py-2">{row.sold_qty.toLocaleString("ko-KR")}</td>
                    <td className="px-2 py-2">{row.mortality_qty.toLocaleString("ko-KR")}</td>
                    <td className="px-2 py-2 font-semibold">
                      {row.remaining_qty.toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard titleKo="최근 폐사 기록" titleEn="Recent Mortality Logs">
          <ul className="space-y-2 text-xs md:text-sm">
            {(mortalityResult.data ?? []).map((row) => {
              const shipment = getRelationRef(row.shipments);
              const species = getRelationRef(row.species);

              return (
                <li key={row.id} className="rounded-lg border border-line bg-canvas px-3 py-3">
                  <p className="font-semibold text-text-primary">
                    {shipment?.shipment_number ?? "-"} · {species?.name_kr ?? "-"} ({species?.code ?? "-"})
                  </p>
                  <p className="text-text-secondary">
                    {row.recorded_date} · {toNumber(row.quantity).toLocaleString("ko-KR")} ·{" "}
                    {causeLabelKo[row.cause] ?? row.cause}
                  </p>
                  {row.notes ? <p className="mt-1 text-text-secondary">{row.notes}</p> : null}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </section>
    </div>
  );
}
