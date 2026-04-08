import { SectionCard } from "@/components/section-card";

type ModuleOverviewProps = {
  titleKo: string;
  titleEn: string;
  introKo: string;
  introEn: string;
  focusItems: Array<{ ko: string; en: string }>;
};

export function ModuleOverview({
  titleKo,
  titleEn,
  introKo,
  introEn,
  focusItems,
}: ModuleOverviewProps) {
  return (
    <div className="flex flex-col gap-4">
      <section className="app-card p-5 md:p-6">
        <p className="title-en text-xs uppercase tracking-[0.2em]">{titleEn}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
          {titleKo}
        </h2>
        <p className="mt-3 text-sm text-text-secondary">{introKo}</p>
        <p className="title-en mt-1 text-xs">{introEn}</p>
      </section>

      <SectionCard titleKo="초기 구현 범위" titleEn="Initial Implementation Focus">
        <ul className="space-y-2">
          {focusItems.map((item) => (
            <li
              key={item.ko}
              className="rounded-xl border border-line bg-canvas px-3 py-3"
            >
              <p className="text-sm font-medium text-text-primary">{item.ko}</p>
              <p className="title-en text-xs">{item.en}</p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
