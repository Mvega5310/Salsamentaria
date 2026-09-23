# SalsaPOS

Sistema POS + PWA multi-inquilino para salsamentarías (Colombia), con venta por mostrador, tienda pública, facturación electrónica DIAN y suscripción del SaaS.

## Estructura del repositorio

```
backend/    Capa de datos: migraciones SQL de Supabase (esquema, RLS, funciones, métricas, vistas)
frontend/   App Next.js 14 (App Router) — UI + rutas API + server actions
docs/       Documentación de arquitectura e historial de sprints
```

Este proyecto es full-stack sobre Next.js + Supabase: no hay un servidor backend independiente. "Backend" aquí es la capa de datos de Supabase (Postgres, Row-Level Security, funciones `SECURITY DEFINER`, vistas de métricas); la lógica de servidor propiamente dicha (rutas API, server actions, middleware) vive dentro de `frontend/` porque así lo pide el App Router de Next.js.

## `backend/migrations/`

18 migraciones, deben aplicarse en orden (01 → 18) contra un proyecto Supabase, vía SQL Editor o `supabase db push`. Cada una asume que las anteriores ya corrieron.

## `frontend/`

```bash
cd frontend
cp .env.example .env.local     # completa las credenciales reales (Supabase, Wompi, Factus)
npm install
npm run dev                    # http://localhost:3000
```

Requiere Node 18.18+ (o 20+).

### Estado conocido (pendiente antes de producción)

- `tsc --noEmit` reporta 20 errores preexistentes (no introducidos al reestructurar el proyecto):
  - `app/tienda/[slug]/pagar/[orderId]/page.tsx` y `app/tienda/[slug]/pedido/[orderId]/page.tsx`: las llamadas a `supabase.rpc(...)` infieren `{}` porque el proyecto nunca incluyó el tipo `Database` generado por Supabase.
  - `lib/supabase/middleware.ts` y `lib/supabase/server.ts`: parámetros implícitamente `any` en el callback `setAll` de `@supabase/ssr`, bajo `strict: true`.
- No hay `.eslintrc` ni script `lint` — Next no trae ESLint configurado en este proyecto.
- `npm run dev` arranca correctamente pero cualquier ruta que toque Supabase devuelve 500 sin credenciales reales en `.env.local` (comportamiento esperado).
- `next@14.2.15` tiene 2 vulnerabilidades conocidas según `npm audit` (1 alta, 1 crítica) — revisar antes de desplegar.

## `docs/historial-sprints/`

El proyecto se construyó incrementalmente en 11 sprints (cada uno como una conversación separada). Estas carpetas son el archivo histórico de esa construcción, ya consolidado en `backend/` y `frontend/`:

| Carpeta | Contenido |
|---|---|
| `01-capa-datos-sql-supabase` | Esquema, RLS, funciones, métricas, semilla |
| `02-app-nextjs-base-pos-tablero-onboarding` | Auth, POS de mostrador, tablero, onboarding |
| `03-catalogo-productos` | Panel de catálogo (productos/categorías) |
| `04-dashboard-metricas` | Dashboard de métricas de ventas |
| `05-suscripcion-wompi-facturacion-dian` | Suscripción SaaS (Wompi) + facturación electrónica (Factus) |
| `06-gating-por-plan` | Bloqueo de features según plan contratado |
| `07-credenciales-dian-cron-cobro` | Credenciales DIAN por tenant + cron de cobro mensual |
| `08-tienda-publica-storefront` | Catálogo público `/tienda/<slug>` sin cuenta |
| `09-pwa-instalable` | Manifest e íconos dinámicos por negocio, service worker |
| `10-tablero-tiempo-real` | Alertas en vivo de pedidos nuevos (Supabase Realtime) |
| `11-pago-online-storefront-wompi` | Pago en línea en el checkout del cliente final |

Ver `docs/historial-sprints/11-pago-online-storefront-wompi/ARQUITECTURA.md` para la arquitectura completa y más reciente.

## Pendiente en el producto (no solo en el código)

- Pasarela de pago para el checkout de cada salsamentaría con sus propios clientes más allá de Wompi (candidato: Bold)
- Notificación por WhatsApp (Twilio o Meta Cloud API, sin decidir)
- Agente de impresora térmica de mostrador
- Pantalla de pesaje con balanza conectada
- Clasificación real de IVA por producto, validada por el contador del negocio (la semilla en `01_schema.sql`/`05_seed.sql` es solo un punto de partida)
