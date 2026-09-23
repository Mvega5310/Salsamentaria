export default function MetricCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: "salsa" | "hoja" | "mostaza" | "ink";
}) {
  const accentColor =
    accent === "hoja"
      ? "#3E6B52"
      : accent === "mostaza"
        ? "#D98B2B"
        : accent === "ink"
          ? "#2A1C16"
          : "#B23A1E";

  return (
    <div className="rounded-xl2 border border-borde bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div
        className="tabular mt-1.5 font-display text-[28px] font-extrabold tracking-tight"
        style={{ color: accentColor }}
      >
        {value}
      </div>
      {sublabel ? (
        <div className="mt-0.5 text-[11.5px] text-muted">{sublabel}</div>
      ) : null}
    </div>
  );
}
