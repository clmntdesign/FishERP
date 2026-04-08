import type { ReactNode } from "react";
import { signOutAction } from "@/app/(ops)/actions";
import { MainNav } from "@/components/main-nav";
import { requireUser } from "@/lib/auth";
import { appModules } from "@/lib/modules";

type OpsLayoutProps = {
  children: ReactNode;
};

export default async function OpsLayout({ children }: OpsLayoutProps) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.full_name?.trim() || user.email || "운영 사용자";
  const roleLabel = profile?.role ?? "admin";

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-end justify-between gap-3 px-4 py-4 md:px-6 md:py-5">
          <div>
            <p className="title-en text-xs uppercase tracking-[0.18em]">Fish ERP</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
              OFECO 수입 운영 시스템
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Korean-first · bilingual ready · mobile responsive
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-line bg-white px-3 py-2 text-right">
              <p className="text-xs font-medium text-text-primary">{displayName}</p>
              <p className="title-en text-[11px]">{roleLabel}</p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="badge-soft rounded-full px-3 py-2 text-xs font-medium hover:bg-surface-strong"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4 md:grid-cols-[290px_1fr] md:gap-6 md:px-6 md:py-6">
        <aside>
          <MainNav items={appModules} />
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
