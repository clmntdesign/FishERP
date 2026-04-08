import type { ReactNode } from "react";
import { MainNav } from "@/components/main-nav";
import { appModules } from "@/lib/modules";

type OpsLayoutProps = {
  children: ReactNode;
};

export default function OpsLayout({ children }: OpsLayoutProps) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-end justify-between px-4 py-4 md:px-6 md:py-5">
          <div>
            <p className="title-en text-xs uppercase tracking-[0.18em]">Fish ERP</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
              OFECO 수입 운영 시스템
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Korean-first · bilingual ready · mobile responsive
            </p>
          </div>
          <span className="badge-soft rounded-full px-3 py-1 text-xs font-medium">
            KR Primary / EN Support
          </span>
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
