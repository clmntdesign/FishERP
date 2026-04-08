type MetricCardProps = {
  titleKo: string;
  titleEn: string;
  value: string;
  hint: string;
  tone?: "default" | "warning";
};

export function MetricCard({
  titleKo,
  titleEn,
  value,
  hint,
  tone = "default",
}: MetricCardProps) {
  return (
    <article className="app-card p-4 md:p-5">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-text-primary">{titleKo}</h2>
        <p className="title-en text-xs">{titleEn}</p>
      </header>
      <p
        className={`text-2xl font-semibold tracking-tight md:text-3xl ${
          tone === "warning" ? "text-warning" : "text-accent-strong"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-text-secondary">{hint}</p>
    </article>
  );
}
