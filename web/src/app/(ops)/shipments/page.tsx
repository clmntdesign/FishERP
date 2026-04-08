import { ModuleOverview } from "@/components/module-overview";

export default function ShipmentsPage() {
  return (
    <ModuleOverview
      titleKo="수입관리"
      titleEn="Shipment Management"
      introKo="배치별 수입 정보, 환율, 원가, 상태를 하나의 기록으로 통합합니다."
      introEn="Unifies batch intake, FX, costs, and shipment status in one record."
      focusItems={[
        {
          ko: "배치 생성 폼: 공급처, 입고일, 통관일, 담당자",
          en: "Creation form with supplier, intake date, customs date, owner",
        },
        {
          ko: "품종 라인 입력: 수량, JPY 단가, 등급",
          en: "Line items with quantity, JPY unit price, and grade",
        },
        {
          ko: "부대비용 템플릿: 통관비, 운임, 수조비 등",
          en: "Ancillary costs template for customs, freight, and tank fees",
        },
        {
          ko: "상태 흐름: 통관대기 → 보관중 → 부분판매 → 완료",
          en: "Status flow from customs pending to completed",
        },
      ]}
    />
  );
}
