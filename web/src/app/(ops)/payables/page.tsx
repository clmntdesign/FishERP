import { SectionCard } from "@/components/section-card";
import { canWritePayables, type AppRole, requireUser } from "@/lib/auth";
import { formatKrw } from "@/lib/format";
import {
  PaymentForm,
  type OpenDebitOption,
} from "@/app/(ops)/payables/payment-form";

type RelationRef = {
  code?: string;
  name_kr?: string;
  shipment_number?: string;
};

const txTypeLabelKo: Record<string, string> = {
  debit: "차변",
  credit: "대변",
  bad_debt_writeoff: "대손처리",
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

export default async function PayablesPage() {
  const { supabase, user } = await requireUser();

  const [
    profileResult,
    suppliersResult,
    balancesResult,
    transactionsResult,
    debitResult,
    allocationsResult,
    paymentAllocationSummaryResult,
  ] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("suppliers")
      .select("id, code, name_kr")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("supplier_balances")
      .select("supplier_id, code, name_kr, outstanding_krw")
      .order("outstanding_krw", { ascending: false }),
    supabase
      .from("ap_transactions")
      .select(
        "id, transaction_date, type, amount_krw, description, suppliers(code, name_kr), shipments(shipment_number)",
      )
      .order("transaction_date", { ascending: false })
      .limit(60),
    supabase
      .from("ap_transactions")
      .select("id, supplier_id, transaction_date, amount_krw, shipments(shipment_number)")
      .eq("type", "debit")
      .order("transaction_date", { ascending: false })
      .limit(200),
    supabase
      .from("ap_payment_allocations")
      .select("ap_transaction_id, allocated_amount_krw"),
    supabase
      .from("ap_payment_allocation_summary")
      .select("ap_payment_id, unallocated_amount_krw"),
  ]);

  const role = (profileResult.data?.role as AppRole | null) ?? "admin";
  const writable = canWritePayables(role);

  const balances = balancesResult.data ?? [];
  const totalOutstanding = balances.reduce(
    (sum, row) => sum + toNumber(row.outstanding_krw),
    0,
  );

  const allocationsMap = new Map<string, number>();
  for (const row of allocationsResult.data ?? []) {
    const current = allocationsMap.get(row.ap_transaction_id) ?? 0;
    allocationsMap.set(
      row.ap_transaction_id,
      current + toNumber(row.allocated_amount_krw),
    );
  }

  const openDebits = (debitResult.data ?? [])
    .map((row) => {
      const allocated = allocationsMap.get(row.id) ?? 0;
      const amount = toNumber(row.amount_krw);
      const remaining = amount - allocated;
      const shipment = getRelationRef(row.shipments);

      return {
        id: row.id,
        supplier_id: row.supplier_id,
        shipment_number: shipment?.shipment_number ?? null,
        transaction_date: row.transaction_date,
        amount_krw: amount,
        allocated_krw: allocated,
        remaining_krw: remaining,
      };
    })
    .filter((row) => row.remaining_krw > 0) as OpenDebitOption[];

  const unallocatedPaymentRows = (paymentAllocationSummaryResult.data ?? []).map((row) =>
    toNumber(row.unallocated_amount_krw),
  );
  const unallocatedPaymentTotal = unallocatedPaymentRows.reduce(
    (sum, amount) => sum + Math.max(amount, 0),
    0,
  );
  const unallocatedPaymentCount = unallocatedPaymentRows.filter(
    (amount) => amount > 0,
  ).length;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">총 미지급</p>
          <p className="mt-2 text-2xl font-semibold text-warning">
            {formatKrw(totalOutstanding)}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">공급처 수</p>
          <p className="mt-2 text-2xl font-semibold text-accent-strong">
            {balances.length.toLocaleString("ko-KR")}
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">미배정 지급금</p>
          <p className="mt-2 text-2xl font-semibold text-warning">
            {formatKrw(unallocatedPaymentTotal)}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {unallocatedPaymentCount.toLocaleString("ko-KR")}건 미배정
          </p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold text-text-secondary">미배정 차변 건수</p>
          <p className="mt-2 text-2xl font-semibold text-accent-strong">
            {openDebits.length.toLocaleString("ko-KR")}
          </p>
        </div>
      </section>

      {writable ? (
        <PaymentForm
          suppliers={(suppliersResult.data ?? []).map((row) => ({
            id: row.id,
            code: row.code,
            name_kr: row.name_kr,
          }))}
          openDebits={openDebits}
        />
      ) : (
        <SectionCard titleKo="권한 안내" titleEn="Permission Notice">
          <p className="text-sm text-text-secondary">
            현재 계정은 미지급 지급 등록 권한이 없습니다.
          </p>
        </SectionCard>
      )}

      <section className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
        <SectionCard titleKo="공급처 잔액" titleEn="Supplier Outstanding Balances">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th className="px-2 py-2">코드</th>
                  <th className="px-2 py-2">공급처</th>
                  <th className="px-2 py-2">잔액</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => (
                  <tr key={row.supplier_id} className="border-t border-line/70 text-text-primary">
                    <td className="px-2 py-2 font-semibold">{row.code}</td>
                    <td className="px-2 py-2">{row.name_kr}</td>
                    <td className="px-2 py-2">{formatKrw(toNumber(row.outstanding_krw))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard titleKo="거래 원장" titleEn="AP Transaction Ledger">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th className="px-2 py-2">일자</th>
                  <th className="px-2 py-2">공급처</th>
                  <th className="px-2 py-2">유형</th>
                  <th className="px-2 py-2">배치</th>
                  <th className="px-2 py-2">금액</th>
                  <th className="px-2 py-2">설명</th>
                </tr>
              </thead>
              <tbody>
                {(transactionsResult.data ?? []).map((row) => {
                  const supplier = getRelationRef(row.suppliers);
                  const shipment = getRelationRef(row.shipments);

                  return (
                    <tr key={row.id} className="border-t border-line/70 text-text-primary">
                      <td className="px-2 py-2">{row.transaction_date}</td>
                      <td className="px-2 py-2">
                        {supplier?.name_kr ?? "-"} ({supplier?.code ?? "-"})
                      </td>
                      <td className="px-2 py-2">{txTypeLabelKo[row.type] ?? row.type}</td>
                      <td className="px-2 py-2">{shipment?.shipment_number ?? "-"}</td>
                      <td className="px-2 py-2">{formatKrw(toNumber(row.amount_krw))}</td>
                      <td className="px-2 py-2">{row.description ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
