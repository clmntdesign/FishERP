export type ModuleItem = {
  href: string;
  ko: string;
  en: string;
  descriptionKo: string;
  descriptionEn: string;
};

export const appModules: ModuleItem[] = [
  {
    href: "/dashboard",
    ko: "대시보드",
    en: "Dashboard",
    descriptionKo: "활성 수입, 재고, 손익, 미지급 현황",
    descriptionEn: "Active imports, inventory, margin, and AP snapshot",
  },
  {
    href: "/shipments",
    ko: "수입관리",
    en: "Shipment",
    descriptionKo: "수입 배치 생성, 원가 입력, 상태 관리",
    descriptionEn: "Batch intake, costs, and lifecycle control",
  },
  {
    href: "/inventory",
    ko: "현재고",
    en: "Inventory",
    descriptionKo: "배치별 잔량, 폐사 기록, 재고 이상 감지",
    descriptionEn: "Stock by batch, mortality logging, anomaly checks",
  },
  {
    href: "/sales",
    ko: "판매",
    en: "Sales",
    descriptionKo: "출하, 매출, 미수채권 에이징 및 입금 처리",
    descriptionEn: "Dispatch, revenue, receivables aging, and payment posting",
  },
  {
    href: "/payables",
    ko: "미지급관리",
    en: "Payables",
    descriptionKo: "공급처 미지급 잔액 및 지급 배분",
    descriptionEn: "Supplier balances and payment allocation",
  },
  {
    href: "/master-data",
    ko: "기준정보",
    en: "Master Data",
    descriptionKo: "공급처, 거래처, 품종, 사용자 기준값",
    descriptionEn: "Suppliers, buyers, species, and user references",
  },
];
