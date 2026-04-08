import { SectionCard } from "@/components/section-card";
import {
  canCreateSales,
  canUpdateSales,
  type AppRole,
  requireUser,
} from "@/lib/auth";
import { formatKrw } from "@/lib/format";
import {
  markSalePaidAction,
  updateSaleStatusAction,
} from "@/app/(ops)/sales/actions";
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

type AgingRow = {
  aging_bucket: string;
  aging_bucket_ko: string;
  invoice_count: number;
  amount_krw: number;
};

const statusLabelKo: Record<string, string> = {
  dispatched: "출하완료",
  invoiced: "청구완료",
  paid: "입금완료",
  overdue: "지연",
};

const agingOrder: Record<string, number> = {
  no_due_date: 1,
  not_due: 2,
  overdue_1_7: 3,
  overdue_8_30: 4,
  overdue_31_plus: 5,
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

function formatDate(value: string | null) {
  return value || "-";
}

export default async function SalesPage() {
  const { supabase, user } = await requireUser();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [
    profileResult,
    buyersResult,
    stockResult,
    salesResult,
    receivableBalancesResult,
    openReceivablesResult,
    agingSummaryResult,
  ] = await Promise.all([
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
      .limit(80),
    supabase
      .from("buyer_receivable_balances")
      .select(
        "buyer_id, code, name, outstanding_krw, overdue_krw, open_invoice_count, overdue_invoice_count, oldest_overdue_date",
      )
      .order("outstanding_krw", { ascending: false }),
    supabase
      .from("open_receivables")
      .select(
        "sale_id, buyer_code, buyer_name, shipment_number, species_code, species_name_kr, dispatch_date, expected_payment_date, total_krw, days_overdue, is_overdue",
      )
      .order("is_overdue", { ascending: false })
      .order("days_overdue", { ascending: false })
      .limit(120),
    supabase
      .from("receivable_aging_summary")
      .select("aging_bucket, aging_bucket_ko, invoice_count, amount_krw"),
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

  const receivableBalances = (receivableBalancesResult.data ?? [])
    .map((row) => ({
      buyer_id: row.buyer_id,
      code: row.code,
      name: row.name,
      outstanding_krw: toNumber(row.outstanding_krw),
      overdue_krw: toNumber(row.overdue_krw),
      open_invoice_count: toNumber(row.open_invoice_count),
      overdue_invoice_count: toNumber(row.overdue_invoice_count),
      oldest_overdue_date: row.oldest_overdue_date,
    }))
    .filter((row) => row.outstanding_krw > 0)
    .sort((a, b) => b.outstanding_krw - a.outstanding_krw);

  const openReceivables = (openReceivablesResult.data ?? []).map((row) => ({
    sale_id: row.sale_id,
    buyer_code: row.buyer_code,
    buyer_name: row.buyer_name,
    shipment_number: row.shipment_number,
    species_code: row.species_code,
    species_name_kr: row.species_name_kr,
    dispatch_date: row.dispatch_date,
    expected_payment_date: row.expected_payment_date,
    total_krw: toNumber(row.total_krw),
    days_overdue: toNumber(row.days_overdue),
    is_overdue: Boolean(row.is_overdue),
  }));

  const agingRows = ((agingSummaryResult.data ?? []) as AgingRow[])
    .map((row) => ({
      ...row,
      invoice_count: toNumber(row.invoice_count),
      amount_krw: toNumber(row.amount_krw),
    }))
    .sort(
      (a, b) =>
        (agingOrder[a.aging_bucket] ?? Number.MAX_SAFE_INTEGER) -
        (agingOrder[b.aging_bucket] ?? Number.MAX_SAFE_INTEGER),
    );

  const outstandingTotal = receivableBalances.reduce(
    (sum, row) => sum + row.outstanding_krw,
    0,
  );
  const overdueTotal = receivableBalances.reduce((sum, row) => sum + row.overdue_krw, 0);
  const overdueInvoiceCount = receivableBalances.reduce(
    (sum, row) => sum + row.overdue_invoice_count,
    0,
  );
  const openInvoiceCount = receivableBalances.reduce(
    (sum, row) => sum + row.open_invoice_count,
    0,
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">미수채권 총액</p>
          <p className="mt-2 text-2xl font-semibold text-warning">{formatKrw(outstandingTotal)}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">지연 미수금</p>
          <p className="mt-2 text-2xl font-semibold text-warning">{formatKrw(overdueTotal)}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">열린 미수 건수</p>
          <p className="mt-2 text-2xl font-semibold text-accent-strong">
            {openInvoiceCount.toLocaleString("ko-KR")}건
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">지연 건수</p>
          <p className="mt-2 text-2xl font-semibold text-warning">
            {overdueInvoiceCount.toLocaleString("ko-KR")}건
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

      <section className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <SectionCard titleKo="거래처 미수 요약" titleEn="Buyer Receivable Balances">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th className="px-2 py-2">거래처</th>
                  <th className="px-2 py-2">미수금</th>
                  <th className="px-2 py-2">지연미수</th>
                  <th className="px-2 py-2">미수건</th>
                  <th className="px-2 py-2">지연건</th>
                  <th className="px-2 py-2">최장연체일</th>
                </tr>
              </thead>
              <tbody>
                {receivableBalances.length === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-text-secondary" colSpan={6}>
                      현재 열린 미수채권이 없습니다.
                    </td>
                  </tr>
                ) : (
                  receivableBalances.map((row) => (
                    <tr key={row.buyer_id} className="border-t border-line/70 text-text-primary">
                      <td className="px-2 py-2">
                        {row.name} ({row.code})
                      </td>
                      <td className="px-2 py-2">{formatKrw(row.outstanding_krw)}</td>
                      <td className="px-2 py-2">{formatKrw(row.overdue_krw)}</td>
                      <td className="px-2 py-2">{row.open_invoice_count.toLocaleString("ko-KR")}</td>
                      <td className="px-2 py-2">{row.overdue_invoice_count.toLocaleString("ko-KR")}</td>
                      <td className="px-2 py-2">{formatDate(row.oldest_overdue_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard titleKo="미수 에이징" titleEn="Receivable Aging Buckets">
          <ul className="space-y-2">
            {agingRows.length === 0 ? (
              <li className="rounded-xl border border-line bg-canvas px-3 py-3 text-sm text-text-secondary">
                현재 열린 미수채권이 없습니다.
              </li>
            ) : (
              agingRows.map((row) => (
                <li
                  key={row.aging_bucket}
                  className="rounded-xl border border-line bg-canvas px-3 py-3"
                >
                  <p className="text-sm font-semibold text-text-primary">{row.aging_bucket_ko}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {row.invoice_count.toLocaleString("ko-KR")}건 · {formatKrw(row.amount_krw)}
                  </p>
                </li>
              ))
            )}
          </ul>
        </SectionCard>
      </section>

      <SectionCard titleKo="미수채권 목록" titleEn="Open Receivables Ledger">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead>
              <tr className="text-left text-text-secondary">
                <th className="px-2 py-2">거래처</th>
                <th className="px-2 py-2">배치</th>
                <th className="px-2 py-2">품종</th>
                <th className="px-2 py-2">출하일</th>
                <th className="px-2 py-2">입금예정일</th>
                <th className="px-2 py-2">지연일수</th>
                <th className="px-2 py-2">금액</th>
                <th className="px-2 py-2">처리</th>
              </tr>
            </thead>
            <tbody>
              {openReceivables.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-text-secondary" colSpan={8}>
                    현재 열린 미수채권이 없습니다.
                  </td>
                </tr>
              ) : (
                openReceivables.map((row) => (
                  <tr key={row.sale_id} className="border-t border-line/70 text-text-primary">
                    <td className="px-2 py-2">
                      {row.buyer_name ?? "-"} ({row.buyer_code ?? "-"})
                    </td>
                    <td className="px-2 py-2 font-semibold">{row.shipment_number ?? "-"}</td>
                    <td className="px-2 py-2">
                      {row.species_name_kr ?? "-"} ({row.species_code ?? "-"})
                    </td>
                    <td className="px-2 py-2">{formatDate(row.dispatch_date)}</td>
                    <td className="px-2 py-2">{formatDate(row.expected_payment_date)}</td>
                    <td className="px-2 py-2">
                      {row.is_overdue
                        ? `${row.days_overdue.toLocaleString("ko-KR")}일`
                        : "-"}
                    </td>
                    <td className="px-2 py-2">{formatKrw(row.total_krw)}</td>
                    <td className="px-2 py-2">
                      {updateAllowed ? (
                        <form action={markSalePaidAction} className="grid gap-1">
                          <input type="hidden" name="sale_id" value={row.sale_id} />
                          <input
                            type="hidden"
                            name="expected_payment_date"
                            value={row.expected_payment_date ?? ""}
                          />
                          <input
                            type="date"
                            name="actual_payment_date"
                            defaultValue={todayIso}
                            className="h-8 rounded-md border border-line bg-white px-2 text-xs"
                          />
                          <button
                            type="submit"
                            className="h-8 rounded-md border border-line bg-white px-2 text-xs font-semibold"
                          >
                            입금처리
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-text-secondary">조회 전용</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

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
