import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";
import { requireUser } from "@/lib/auth";
import { formatKrw, formatPercent } from "@/lib/format";

const statusKoMap: Record<string, string> = {
  pending_customs: "통관 대기",
  in_tank: "보관중",
  partially_sold: "부분 판매",
  completed: "완료",
};

const statusEnMap: Record<string, string> = {
  pending_customs: "Pending Customs",
  in_tank: "In Tank",
  partially_sold: "Partially Sold",
  completed: "Completed",
};

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function summarizeInTankDays(intakeDate: string | null) {
  if (!intakeDate) return null;
  const today = new Date();
  const intake = new Date(intakeDate);
  const diffMs = today.getTime() - intake.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return days >= 0 ? days : 0;
}

export default async function DashboardPage() {
  const { supabase } = await requireUser();

  const today = new Date();
  const agedCutoff = new Date(today);
  agedCutoff.setDate(today.getDate() - 14);
  const agedCutoffIso = agedCutoff.toISOString().slice(0, 10);

  const [
    shipmentStatusResult,
    inventorySummaryResult,
    supplierBalanceResult,
    recentShipmentsResult,
    financialSummaryResult,
    agedShipmentsResult,
  ] = await Promise.all([
    supabase.from("shipments").select("status"),
    supabase
      .from("shipment_inventory_summary")
      .select("shipment_id, remaining_qty, intake_qty, sold_qty, mortality_qty"),
    supabase.from("supplier_balances").select("code, name_kr, outstanding_krw"),
    supabase
      .from("shipments")
      .select("id, shipment_number, status, intake_date, suppliers(code, name_kr)")
      .order("intake_date", { ascending: false })
      .limit(6),
    supabase
      .from("shipment_financial_summary")
      .select("shipment_id, net_margin_pct, net_profit_krw"),
    supabase
      .from("shipments")
      .select("shipment_number, intake_date")
      .in("status", ["in_tank", "partially_sold"])
      .lte("intake_date", agedCutoffIso)
      .order("intake_date", { ascending: true })
      .limit(5),
  ]);

  const statusRows = shipmentStatusResult.data ?? [];
  const activeStatusRows = statusRows.filter((row) => row.status !== "completed");
  const inTankCount = statusRows.filter((row) => row.status === "in_tank").length;
  const pendingCustomsCount = statusRows.filter(
    (row) => row.status === "pending_customs",
  ).length;

  const inventoryRows = inventorySummaryResult.data ?? [];
  const totalRemaining = inventoryRows.reduce(
    (sum, row) => sum + toNumber(row.remaining_qty),
    0,
  );

  const supplierBalances = (supplierBalanceResult.data ?? [])
    .map((row) => ({
      ...row,
      outstanding: toNumber(row.outstanding_krw),
    }))
    .sort((a, b) => b.outstanding - a.outstanding);
  const totalOutstanding = supplierBalances.reduce(
    (sum, row) => sum + row.outstanding,
    0,
  );

  const financialRows = financialSummaryResult.data ?? [];
  const financialByShipment = new Map(
    financialRows.map((row) => [row.shipment_id, row]),
  );

  const marginRows = financialRows.filter(
    (row) => row.net_margin_pct !== null && row.net_margin_pct !== undefined,
  );
  const avgMargin =
    marginRows.length > 0
      ? marginRows.reduce((sum, row) => sum + toNumber(row.net_margin_pct), 0) /
        marginRows.length
      : 0;

  const lowMarginCount = financialRows.filter(
    (row) => toNumber(row.net_profit_krw) < 0,
  ).length;

  const alerts = [
    ...(agedShipmentsResult.data ?? []).map((row) => {
      const days = summarizeInTankDays(row.intake_date) ?? 0;
      return {
        ko: `${row.shipment_number} 배치가 ${days}일째 보관 중입니다.`,
        en: `${row.shipment_number} has stayed in tank for ${days} days.`,
      };
    }),
  ];

  const highestOutstanding = supplierBalances[0];
  if (highestOutstanding && highestOutstanding.outstanding > 10_000_000) {
    alerts.push({
      ko: `${highestOutstanding.name_kr} 미지급 잔액이 ${formatKrw(
        highestOutstanding.outstanding,
      )} 입니다.`,
      en: `${highestOutstanding.code} payable reached ${formatKrw(
        highestOutstanding.outstanding,
      )}.`,
    });
  }

  if (lowMarginCount > 0) {
    alerts.push({
      ko: `현재 ${lowMarginCount}개 배치가 손실 상태입니다.`,
      en: `${lowMarginCount} shipment(s) are currently loss-making.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      ko: "현재 확인된 운영 경고가 없습니다.",
      en: "No active operational alerts right now.",
    });
  }

  const inventoryByShipment = new Map(
    (inventorySummaryResult.data ?? []).map((row) => [
      row.shipment_id,
      toNumber(row.remaining_qty),
    ]),
  );

  const shipmentRows = (recentShipmentsResult.data ?? []).map((row) => {
    const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers;
    const financial = financialByShipment.get(row.id);
    const marginValue =
      financial?.net_margin_pct === null || financial?.net_margin_pct === undefined
        ? null
        : toNumber(financial.net_margin_pct);
    const remaining = inventoryByShipment.get(row.id);

    return {
      shipmentNo: row.shipment_number,
      supplier: supplier?.name_kr ?? supplier?.code ?? "-",
      statusKo: statusKoMap[row.status] ?? row.status,
      statusEn: statusEnMap[row.status] ?? row.status,
      margin: marginValue === null ? "-" : formatPercent(marginValue),
      stock:
        remaining === undefined
          ? "-"
          : `${remaining.toLocaleString("ko-KR")} units`,
    };
  });

  const metrics = [
    {
      titleKo: "활성 수입 배치",
      titleEn: "Active Shipments",
      value: `${activeStatusRows.length.toLocaleString("ko-KR")} 건`,
      hint: `In Tank ${inTankCount}건 · Pending Customs ${pendingCustomsCount}건`,
    },
    {
      titleKo: "현재고(전체)",
      titleEn: "Live Stock",
      value: `${totalRemaining.toLocaleString("ko-KR")} units`,
      hint: "잔량 = 입고 - 출하 - 폐사",
    },
    {
      titleKo: "공급처 미지급",
      titleEn: "Accounts Payable",
      value: formatKrw(totalOutstanding),
      hint:
        highestOutstanding && highestOutstanding.outstanding > 0
          ? `${highestOutstanding.name_kr} 최대 ${formatKrw(
              highestOutstanding.outstanding,
            )}`
          : "미지급 잔액 없음",
    },
    {
      titleKo: "평균 순이익률",
      titleEn: "Average Net Margin",
      value: formatPercent(avgMargin),
      hint: `손실 배치 ${lowMarginCount}건`,
      tone: avgMargin < 0 ? ("warning" as const) : ("default" as const),
    },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.titleKo} {...metric} />
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <SectionCard titleKo="운영 알림" titleEn="Operational Alerts">
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.ko}
                className="rounded-xl border border-line bg-canvas px-3 py-3"
              >
                <p className="text-sm font-medium text-text-primary">{alert.ko}</p>
                <p className="title-en text-xs">{alert.en}</p>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard titleKo="MVP 진행 상태" titleEn="MVP Build Status">
          <div className="space-y-2 text-sm text-text-primary">
            <p className="rounded-xl border border-line bg-canvas px-3 py-3">
              <span className="font-semibold">완료</span> · 로그인 보호, 기준정보,
              배치/재고/판매/미지급 운영 플로우
            </p>
            <p className="rounded-xl border border-line bg-canvas px-3 py-3">
              <span className="font-semibold">진행중</span> · 미지급 다중 배정,
              동시성 대응 재고 무결성 강화
            </p>
            <p className="rounded-xl border border-line bg-canvas px-3 py-3">
              <span className="font-semibold">다음 단계</span> · 배치 수정 워크플로,
              과거 이관 스크립트, 대시보드 리스크 지표 확장
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard titleKo="최근 배치" titleEn="Recent Shipments">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-text-secondary">
                <th className="px-3 py-1">배치번호</th>
                <th className="px-3 py-1">공급처</th>
                <th className="px-3 py-1">상태</th>
                <th className="px-3 py-1">마진</th>
                <th className="px-3 py-1">잔량</th>
              </tr>
            </thead>
            <tbody>
              {shipmentRows.map((row) => (
                <tr key={row.shipmentNo} className="app-card bg-white">
                  <td className="rounded-l-xl px-3 py-3 font-semibold text-text-primary">
                    {row.shipmentNo}
                  </td>
                  <td className="px-3 py-3 text-text-primary">{row.supplier}</td>
                  <td className="px-3 py-3">
                    <p className="text-text-primary">{row.statusKo}</p>
                    <p className="title-en text-xs">{row.statusEn}</p>
                  </td>
                  <td className="px-3 py-3 text-text-primary">{row.margin}</td>
                  <td className="rounded-r-xl px-3 py-3 text-text-primary">
                    {row.stock}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
