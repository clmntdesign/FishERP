import { ModuleOverview } from "@/components/module-overview";

export default function SalesPage() {
  return (
    <ModuleOverview
      titleKo="판매"
      titleEn="Sales"
      introKo="출하 단위 판매 기록과 입금 상태를 연결해 배치 손익을 자동 반영합니다."
      introEn="Links dispatch sales and payment status to shipment-level margin."
      focusItems={[
        {
          ko: "출하 입력: 거래처, 품종, 수량, 단가, 출하일",
          en: "Dispatch entry with buyer, species, quantity, and unit price",
        },
        {
          ko: "입금예정일/실입금일 기반 상태 전환",
          en: "Status transitions by expected and actual payment date",
        },
        {
          ko: "미수금 목록 및 지연건 강조",
          en: "Open receivables list with overdue highlighting",
        },
        {
          ko: "판매 반영 시 배치 손익 자동 재계산",
          en: "Automatic shipment margin recalculation on each sale",
        },
      ]}
    />
  );
}
