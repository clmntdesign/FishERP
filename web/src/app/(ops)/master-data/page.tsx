import { SectionCard } from "@/components/section-card";
import { canWriteMasterData, type AppRole, requireUser } from "@/lib/auth";
import {
  BuyerCreateForm,
  SpeciesCreateForm,
  SupplierCreateForm,
} from "@/app/(ops)/master-data/forms";

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
        active
          ? "border border-accent/30 bg-emerald-50 text-accent-strong"
          : "border border-line bg-white text-text-secondary"
      }`}
    >
      {active ? "사용중" : "비활성"}
    </span>
  );
}

export default async function MasterDataPage() {
  const { supabase, user } = await requireUser();

  const [profileResult, suppliersResult, buyersResult, speciesResult] =
    await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase
        .from("suppliers")
        .select("id, code, name_kr, name_en, country_code, payment_terms_days, is_active")
        .order("code", { ascending: true }),
      supabase
        .from("buyers")
        .select("id, code, name, payment_terms_days, is_active")
        .order("code", { ascending: true }),
      supabase
        .from("species")
        .select("id, code, name_kr, name_en, unit, is_active")
        .order("code", { ascending: true }),
    ]);

  const currentRole = (profileResult.data?.role as AppRole | null) ?? "admin";
  const writable = canWriteMasterData(currentRole);

  const suppliers = suppliersResult.data ?? [];
  const buyers = buyersResult.data ?? [];
  const species = speciesResult.data ?? [];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="app-card p-5 md:p-6">
        <p className="title-en text-xs uppercase tracking-[0.2em]">Master Data</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
          기준정보 관리
        </h2>
        <p className="mt-3 text-sm text-text-secondary">
          공급처, 거래처, 품종 정보를 통일된 코드 체계로 관리하여 수입/판매 입력의
          오류를 줄입니다.
        </p>
        <p className="title-en mt-1 text-xs">
          Standardize suppliers, buyers, and species to stabilize all downstream
          workflows.
        </p>
      </section>

      <SectionCard titleKo="입력 권한" titleEn="Write Permission">
        <p className="text-sm text-text-primary">
          현재 역할: <span className="font-semibold">{currentRole}</span>
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          {writable
            ? "기준정보 추가 권한이 활성화되어 있습니다."
            : "현재 계정은 조회 전용입니다. 관리자 또는 운영관리자 역할이 필요합니다."}
        </p>
      </SectionCard>

      {writable ? (
        <section className="grid gap-4 xl:grid-cols-3">
          <SupplierCreateForm />
          <BuyerCreateForm />
          <SpeciesCreateForm />
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <SectionCard titleKo="공급처" titleEn="Suppliers">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th className="px-2 py-2">코드</th>
                  <th className="px-2 py-2">이름</th>
                  <th className="px-2 py-2">조건</th>
                  <th className="px-2 py-2">상태</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((item) => (
                  <tr key={item.id} className="border-t border-line/70 text-text-primary">
                    <td className="px-2 py-2 font-semibold">{item.code}</td>
                    <td className="px-2 py-2">
                      <p>{item.name_kr}</p>
                      <p className="title-en text-[11px]">{item.name_en ?? "-"}</p>
                    </td>
                    <td className="px-2 py-2">{item.payment_terms_days}일</td>
                    <td className="px-2 py-2">
                      <ActiveBadge active={Boolean(item.is_active)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard titleKo="거래처" titleEn="Buyers">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th className="px-2 py-2">코드</th>
                  <th className="px-2 py-2">거래처명</th>
                  <th className="px-2 py-2">조건</th>
                  <th className="px-2 py-2">상태</th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((item) => (
                  <tr key={item.id} className="border-t border-line/70 text-text-primary">
                    <td className="px-2 py-2 font-semibold">{item.code}</td>
                    <td className="px-2 py-2">{item.name}</td>
                    <td className="px-2 py-2">{item.payment_terms_days}일</td>
                    <td className="px-2 py-2">
                      <ActiveBadge active={Boolean(item.is_active)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard titleKo="품종" titleEn="Species">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th className="px-2 py-2">코드</th>
                  <th className="px-2 py-2">이름</th>
                  <th className="px-2 py-2">단위</th>
                  <th className="px-2 py-2">상태</th>
                </tr>
              </thead>
              <tbody>
                {species.map((item) => (
                  <tr key={item.id} className="border-t border-line/70 text-text-primary">
                    <td className="px-2 py-2 font-semibold">{item.code}</td>
                    <td className="px-2 py-2">
                      <p>{item.name_kr}</p>
                      <p className="title-en text-[11px]">{item.name_en ?? "-"}</p>
                    </td>
                    <td className="px-2 py-2">{item.unit}</td>
                    <td className="px-2 py-2">
                      <ActiveBadge active={Boolean(item.is_active)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
