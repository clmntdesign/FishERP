import { SectionCard } from "@/components/section-card";
import {
  canCreateSales,
  canUpdateSales,
  type AppRole,
  requireUser,
} from "@/lib/auth";
import { formatKrw } from "@/lib/format";
import { updateSaleStatusAction } from "@/app/(ops)/sales/actions";
import {
  SaleCreateForm,
  type SaleStockOption,
} from "@/app/(ops)/sales/sale-create-form";

type RelationRef = {
  shipment_number?: string;
  code?: string;
  name?: string;
  name_kr?: string;
};

const statusLabelKo: Record<string, string> = {
  dispatched: "출하완료",
  invoiced: "청구완료",
  paid: "입금완료",
  overdue: "지연",
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

export default async function SalesPage() {
  const { supabase, user } = await requireUser();

  const [profileResult, buyersResult, stockResult, salesResult] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("buyers")
      .select("id, code, name")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("shipment_species_inventory_summary")
      .select(
        "shipment_id, shipment_number, status, species_id, species_code, species_name_kr, remaining_qty",
      )
      .gt("remaining_qty", 0)
      .in("status", ["in_tank", "partially_sold"])
      .order("shipment_number", { ascending: false }),
    supabase
      .from("sales")
      .select(
        "id, dispatch_date, quantity, unit_price_krw, total_krw, expected_payment_date, actual_payment_date, status, notes, shipments(shipment_number), buyers(code, name), species(code, name_kr)",
      )
      .order("dispatch_date", { ascending: false })
      .limit(40),
  ]);

  const role = (profileResult.data?.role as AppRole | null) ?? "admin";
  const createAllowed = canCreateSales(role);
  const updateAllowed = canUpdateSales(role);

  const buyers = (buyersResult.data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
  }));

  const stockOptions = (stockResult.data ?? []).map((row) => ({
    shipment_id: row.shipment_id,
    shipment_number: row.shipment_number,
    species_id: row.species_id,
    species_code: row.species_code,
    species_name_kr: row.species_name_kr,
    remaining_qty: toNumber(row.remaining_qty),
  })) as SaleStockOption[];

  const salesRows = salesResult.data ?? [];
  const openAmount = salesRows
    .filter((row) => row.status !== "paid")
    .reduce((sum, row) => sum + toNumber(row.total_krw), 0);
  const overdueCount = salesRows.filter((row) => row.status === "overdue").length;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">최근 판매 건수</p>
          <p className="mt-2 text-2xl font-semibold text-accent-strong">
            {salesRows.length.toLocaleString("ko-KR")}건
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">미수금</p>
          <p className="mt-2 text-2xl font-semibold text-warning">{formatKrw(openAmount)}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">지연 건수</p>
          <p className="mt-2 text-2xl font-semibold text-warning">
            {overdueCount.toLocaleString("ko-KR")}건
          </p>
        </div>
      </section>

      {createAllowed ? (
        <SaleCreateForm stockOptions={stockOptions} buyers={buyers} />
      ) : (
        <SectionCard titleKo="권한 안내" titleEn="Permission Notice">
          <p className="text-sm text-text-secondary">
            현재 계정은 판매 등록 권한이 없습니다.
          </p>
        </SectionCard>
      )}

      <SectionCard titleKo="판매 이력" titleEn="Sales Ledger">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead>
              <tr className="text-left text-text-secondary">
                <th className="px-2 py-2">출하일</th>
                <th className="px-2 py-2">배치</th>
                <th className="px-2 py-2">품종</th>
                <th className="px-2 py-2">거래처</th>
                <th className="px-2 py-2">수량</th>
                <th className="px-2 py-2">매출</th>
                <th className="px-2 py-2">상태</th>
                <th className="px-2 py-2">입금관리</th>
              </tr>
            </thead>
            <tbody>
              {salesRows.map((row) => {
                const shipment = getRelationRef(row.shipments);
                const species = getRelationRef(row.species);
                const buyer = getRelationRef(row.buyers);

                return (
                  <tr key={row.id} className="border-t border-line/70 text-text-primary">
                    <td className="px-2 py-2">{row.dispatch_date}</td>
                    <td className="px-2 py-2 font-semibold">{shipment?.shipment_number ?? "-"}</td>
                    <td className="px-2 py-2">
                      {species?.name_kr ?? "-"} ({species?.code ?? "-"})
                    </td>
                    <td className="px-2 py-2">{buyer?.name ?? "-"}</td>
                    <td className="px-2 py-2">{toNumber(row.quantity).toLocaleString("ko-KR")}</td>
                    <td className="px-2 py-2">{formatKrw(toNumber(row.total_krw))}</td>
                    <td className="px-2 py-2">{statusLabelKo[row.status] ?? row.status}</td>
                    <td className="px-2 py-2">
                      {updateAllowed ? (
                        <form action={updateSaleStatusAction} className="grid gap-1">
                          <input type="hidden" name="sale_id" value={row.id} />
                          <select
                            name="status"
                            defaultValue={row.status}
                            className="h-8 rounded-md border border-line bg-white px-2 text-xs"
                          >
                            <option value="dispatched">출하완료</option>
                            <option value="invoiced">청구완료</option>
                            <option value="paid">입금완료</option>
                            <option value="overdue">지연</option>
                          </select>
                          <input
                            type="date"
                            name="expected_payment_date"
                            defaultValue={row.expected_payment_date ?? ""}
                            className="h-8 rounded-md border border-line bg-white px-2 text-xs"
                          />
                          <input
                            type="date"
                            name="actual_payment_date"
                            defaultValue={row.actual_payment_date ?? ""}
                            className="h-8 rounded-md border border-line bg-white px-2 text-xs"
                          />
                          <button
                            type="submit"
                            className="h-8 rounded-md border border-line bg-white px-2 text-xs font-semibold"
                          >
                            갱신
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-text-secondary">조회 전용</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
