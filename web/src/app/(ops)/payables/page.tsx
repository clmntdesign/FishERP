import { ModuleOverview } from "@/components/module-overview";

export default function PayablesPage() {
  return (
    <ModuleOverview
      titleKo="미지급관리"
      titleEn="Accounts Payable"
      introKo="공급처별 차변/대변 거래를 추적하고 배치와 지급을 명확히 연결합니다."
      introEn="Tracks supplier debit/credit ledger with explicit shipment allocation."
      focusItems={[
        {
          ko: "공급처 대시보드: 현재 미지급 잔액",
          en: "Supplier balance dashboard with current outstanding amounts",
        },
        {
          ko: "배치 연동 차변 자동 생성(입고 시점)",
          en: "Auto-created debit entries when shipments are received",
        },
        {
          ko: "지급 등록 및 다중 배치 배분",
          en: "Payment recording with multi-shipment allocation",
        },
        {
          ko: "대손처리 별도 타입 및 감사 이력 보존",
          en: "Dedicated bad-debt type with audit trace preservation",
        },
      ]}
    />
  );
}
