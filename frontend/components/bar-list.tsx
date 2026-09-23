export default function BarList({
  items,
  formatValue,
  emptyLabel,
}: {
  items: { label: string; value: number; sublabel?: string }[];
  formatValue: (n: number) => string;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <div className="py-6 text-center text-[12.5px] text-muted">
        {emptyLabel}
      </div>
    );
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((i) => (
        <div key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink">
              {i.label}
              {i.sublabel ? (
                <span className="ml-1.5 font-normal text-muted">{i.sublabel}</span>
              ) : null}
            </span>
            <span className="tabular flex-none text-[12.5px] font-bold text-ink">
              {formatValue(i.value)}
            </span>
          </div>
          <div className="h-[6px] overflow-hidden rounded-full bg-crema2">
            <div
              className="h-full rounded-full bg-salsa"
              style={{ width: `${Math.max((i.value / max) * 100, 3)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
