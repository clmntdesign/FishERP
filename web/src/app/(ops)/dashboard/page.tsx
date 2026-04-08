import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";
import { formatKrw, formatPercent } from "@/lib/format";

const metrics = [
  {
    titleKo: "활성 수입 배치",
    titleEn: "Active Shipments",
    value: "2 건",
    hint: "In Tank 2건 · Pending Customs 0건",
  },
  {
    titleKo: "현재고(전체)",
    titleEn: "Live Stock",
    value: "3,420 units",
    hint: "먹장어 3,120 · 무라사키 300",
  },
  {
    titleKo: "공급처 미지급",
    titleEn: "Accounts Payable",
    value: formatKrw(18350000),
    hint: "DAIKEI 12.4M · DAIYUU 5.95M",
  },
  {
    titleKo: "최근 30일 순이익률",
    titleEn: "30-Day Net Margin",
    value: formatPercent(5.4),
    hint: "목표 6.0% 대비 -0.6%p",
    tone: "warning" as const,
  },
];

const alerts = [
  {
    ko: "SHIP-2026-006 배치가 13일째 보관 중입니다.",
    en: "SHIP-2026-006 has remained in tank for 13 days.",
  },
  {
    ko: "최근 3개 배치 평균 마진이 2.3%로 하락했습니다.",
    en: "Rolling 3-shipment margin has dropped to 2.3%.",
  },
  {
    ko: "DAIYUU 미지급 잔액이 설정 기준을 초과했습니다.",
    en: "DAIYUU payable balance exceeded configured threshold.",
  },
];

const shipmentRows = [
  {
    shipmentNo: "SHIP-2026-006",
    supplier: "DAIKEI",
    statusKo: "부분 판매",
    statusEn: "Partially Sold",
    margin: formatPercent(4.2),
    stock: "780 units",
  },
  {
    shipmentNo: "SHIP-2026-007",
    supplier: "DAIYUU",
    statusKo: "보관중",
    statusEn: "In Tank",
    margin: formatPercent(-1.1),
    stock: "1,120 units",
  },
  {
    shipmentNo: "SHIP-2026-008",
    supplier: "DAIKEI",
    statusKo: "통관 대기",
    statusEn: "Pending Customs",
    margin: "-",
    stock: "-",
  },
];

export default function DashboardPage() {
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
              <span className="font-semibold">완료</span> · 프로젝트 스캐폴딩,
              Supabase 초기화, 한국어 중심 UI 셸
            </p>
            <p className="rounded-xl border border-line bg-canvas px-3 py-3">
              <span className="font-semibold">진행중</span> · 초기 DB 스키마 및 모듈
              테이블 구성
            </p>
            <p className="rounded-xl border border-line bg-canvas px-3 py-3">
              <span className="font-semibold">다음 단계</span> · 수입 배치 생성 폼,
              재고 차감 로직, 미지급 자동 집계
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
