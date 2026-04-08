import { ModuleOverview } from "@/components/module-overview";

export default function MasterDataPage() {
  return (
    <ModuleOverview
      titleKo="기준정보"
      titleEn="Master Data"
      introKo="공급처, 거래처, 품종, 사용자 권한의 기준값을 통일해 입력 품질을 높입니다."
      introEn="Standardizes suppliers, buyers, species, and user roles for clean data entry."
      focusItems={[
        {
          ko: "공급처/거래처 코드 체계 및 활성 상태 관리",
          en: "Code systems and active-state controls for suppliers and buyers",
        },
        {
          ko: "품종 단위(unit/kg)와 표준명 관리",
          en: "Species naming and unit management (unit/kg)",
        },
        {
          ko: "사용자 역할 스키마는 다중역할 대비로 선설계",
          en: "Role schema designed now for future multi-role expansion",
        },
        {
          ko: "삭제 대신 비활성화(soft delete) 기본 전략",
          en: "Soft-delete strategy by deactivation instead of hard delete",
        },
      ]}
    />
  );
}
