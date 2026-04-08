import { ModuleOverview } from "@/components/module-overview";

export default function InventoryPage() {
  return (
    <ModuleOverview
      titleKo="현재고"
      titleEn="Live Inventory"
      introKo="배치별 잔량을 실시간으로 추적하고, 폐사/출하 이력을 구조화합니다."
      introEn="Tracks remaining stock by batch and structures mortality/dispatch events."
      focusItems={[
        {
          ko: "배치별·품종별 잔량 계산 및 대시보드 표시",
          en: "Live quantity by batch and species on a single dashboard",
        },
        {
          ko: "폐사 기록: 일자, 수량, 원인, 담당자",
          en: "Mortality logging with date, quantity, cause, and owner",
        },
        {
          ko: "출하 시 잔량 자동 차감 및 음수 재고 차단",
          en: "Automatic stock deduction with negative-stock guard",
        },
        {
          ko: "체류일 임계치 알림(예: 14일 초과)",
          en: "Aging alerts for long-held batches (e.g. over 14 days)",
        },
      ]}
    />
  );
}
