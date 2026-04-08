import { LoginForm } from "@/app/login/login-form";

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next =
    typeof params.next === "string"
      ? params.next
      : Array.isArray(params.next)
        ? params.next[0]
        : "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 md:px-6">
      <div className="w-full max-w-5xl">
        <div className="mb-6 hidden rounded-2xl border border-line bg-white/70 p-5 md:block">
          <h2 className="text-lg font-semibold text-text-primary">
            OFECO 수입 운영 시스템
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            본 시스템은 기존 Excel 파일(수입시트 / 미지급현황)을 대체하는
            운영용 애플리케이션입니다.
          </p>
        </div>
        <LoginForm nextPath={next || "/dashboard"} />
      </div>
    </main>
  );
}
