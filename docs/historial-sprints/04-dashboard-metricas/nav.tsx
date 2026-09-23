import Link from "next/link";
import { signOut } from "@/app/actions";

export default function Nav({
  businessName,
  isAdmin,
}: {
  businessName: string;
  isAdmin: boolean;
}) {
  return (
    <header className="flex items-center gap-4 border-b border-borde bg-crema px-6 py-3">
      <div className="mr-2">
        <div className="font-display text-[18px] font-extrabold leading-none tracking-tight text-salsa">
          {businessName}
        </div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
          SalsaPOS
        </div>
      </div>

      <nav className="flex gap-1">
        <Link
          href="/pos"
          className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink hover:bg-crema2"
        >
          Mostrador
        </Link>
        <Link
          href="/tablero"
          className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink hover:bg-crema2"
        >
          Tablero
        </Link>
        {isAdmin ? (
          <>
            <Link
              href="/catalogo"
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink hover:bg-crema2"
            >
              Catálogo
            </Link>
            <Link
              href="/metricas"
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink hover:bg-crema2"
            >
              Métricas
            </Link>
            <Link
              href="/suscripcion"
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink hover:bg-crema2"
            >
              Suscripción
            </Link>
            <Link
              href="/configuracion/dian"
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink hover:bg-crema2"
            >
              Config. DIAN
            </Link>
          </>
        ) : null}
      </nav>

      <form action={signOut} className="ml-auto">
        <button className="rounded-full border border-borde px-4 py-2 text-[12.5px] font-semibold text-muted hover:bg-crema2">
          Salir
        </button>
      </form>
    </header>
  );
}
