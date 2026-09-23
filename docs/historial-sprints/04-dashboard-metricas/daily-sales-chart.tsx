import { cop } from "@/lib/format";

type Day = { day: string; gross_total: number };

export default function DailySalesChart({ days }: { days: Day[] }) {
  if (days.length === 0) {
    return (
      <div className="py-10 text-center text-[12.5px] text-muted">
        Aún no hay ventas registradas.
      </div>
    );
  }

  const max = Math.max(...days.map((d) => d.gross_total), 1);

  return (
    <div className="flex h-[160px] items-end gap-1.5">
      {days.map((d) => {
        const date = new Date(d.day + "T12:00:00");
        const dayLabel = date.toLocaleDateString("es-CO", { day: "2-digit" });
        const weekday = date.toLocaleDateString("es-CO", { weekday: "short" });
        const heightPct = Math.max((d.gross_total / max) * 100, d.gross_total > 0 ? 4 : 0);

        return (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className="flex h-[112px] w-full items-end"
              title={`${dayLabel} — ${cop(d.gross_total)}`}
            >
              <div
                className="w-full rounded-t-md bg-salsa transition-all"
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <div className="text-center text-[9.5px] leading-none text-muted">
              <div className="font-semibold">{dayLabel}</div>
              <div className="capitalize">{weekday}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
