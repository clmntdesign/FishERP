import type { ReactNode } from "react";

type SectionCardProps = {
  titleKo: string;
  titleEn: string;
  children: ReactNode;
};

export function SectionCard({ titleKo, titleEn, children }: SectionCardProps) {
  return (
    <section className="app-card p-4 md:p-5">
      <header className="mb-4 border-b border-line pb-3">
        <h2 className="text-base font-semibold text-text-primary">{titleKo}</h2>
        <p className="title-en text-xs">{titleEn}</p>
      </header>
      {children}
    </section>
  );
}
