# Mapa de rutas y migraciones

Referencia rápida de qué hace cada pieza. Para el porqué de las decisiones, ver `docs/ARQUITECTURA.md`.

## `frontend/app/` — rutas de la app Next.js

### Públicas (sin sesión)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/login` | `app/login/` | Inicio de sesión con Supabase Auth (correo + contraseña) |
| `/onboarding` | `app/onboarding/` | Registro de un negocio nuevo en trial de 14 días (RPC seguro) |
| `/tienda/[slug]` | `app/tienda/[slug]/` | Catálogo público del negocio, marca dinámica (logo/color), sin necesidad de cuenta |
| `/tienda/[slug]/pedido/[orderId]` | `app/tienda/[slug]/pedido/[orderId]/page.tsx` | Estado del pedido, consultable por id exacto (UUID impredecible) |
| `/tienda/[slug]/pagar/[orderId]` | `app/tienda/[slug]/pagar/[orderId]/page.tsx` | Checkout hospedado de Wompi para pago en línea del pedido |
| `/tienda/[slug]/manifest.webmanifest` | `app/tienda/[slug]/manifest.webmanifest/route.ts` | Manifest de PWA generado por request (nombre/color del negocio) |
| `/tienda/[slug]/icon-192`, `/icon-512` | `app/tienda/[slug]/icon-192\|512/route.tsx` | Íconos de instalación generados dinámicamente (inicial del negocio sobre su color de marca) |
| `/api/webhooks/wompi` | `app/api/webhooks/wompi/route.ts` | Única fuente de verdad sobre pagos (suscripción y pedidos de tienda); firma verificada |
| `/api/cron/charge-subscriptions` | `app/api/cron/charge-subscriptions/route.ts` | Cron diario (Vercel) que cobra suscripciones vencidas vía Wompi; protegido por `CRON_SECRET` |

### Privadas — grupo `(app)`, requieren sesión + negocio (`app/(app)/layout.tsx`)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/pos` | `app/(app)/pos/` | Venta de mostrador: ticket con IVA por producto, cobro como recibo interno o factura DIAN |
| `/tablero` | `app/(app)/tablero/` | Pedidos activos en vivo (Supabase Realtime), alerta sonora/visual/escritorio en pedidos nuevos |
| `/catalogo` | `app/(app)/catalogo/` | Panel de productos y categorías |
| `/metricas` | `app/(app)/metricas/` | Dashboard de ventas (ventas diarias, top productos, mezcla de canal/pago) |
| `/suscripcion` | `app/(app)/suscripcion/` | Tokenización de tarjeta y cobro manual de la suscripción del SaaS |
| `/configuracion/dian` | `app/(app)/configuracion/dian/` | Credenciales Factus por tenant (cifradas) y activación de `dian_enabled` |

### Raíz

| Archivo | Qué hace |
|---|---|
| `app/layout.tsx` | Layout raíz: fuentes, `globals.css` |
| `app/page.tsx` | Redirige a `/pos` |
| `app/actions.ts` | `signOut` |

## `frontend/lib/` — módulos compartidos

| Módulo | Qué hace |
|---|---|
| `lib/supabase/client.ts` | Cliente Supabase de navegador |
| `lib/supabase/server.ts` | Cliente Supabase de servidor (Server Components / Server Actions) |
| `lib/supabase/middleware.ts` | Refresco de sesión; excluye `/tienda`, `/api/webhooks`, `/api/cron` del guardián de login |
| `lib/supabase/admin.ts` | Cliente con `service_role`, creado de forma perezosa (nunca a nivel de módulo — rompería `next build` sin credenciales) |
| `lib/tenant.ts` | Resuelve el negocio y rol del usuario actual |
| `lib/format.ts` | Formato COP, cantidades e IVA por línea (espeja los triggers de la BD) |
| `lib/types.ts` | Tipos de dominio (productos, pedidos, tablero) |
| `lib/entitlements.ts` | Gating: qué puede usar un tenant según plan + estado de suscripción |
| `lib/billing/wompi.ts` | Cliente Wompi: tokenización, cobro recurrente, checkout hospedado, firma de webhooks |
| `lib/dian/factus-client.ts`, `mapping.ts` | Cliente Factus (OAuth2) y mapeo de campos de factura — **verificar contra cuenta real**, ver comentarios |
| `lib/dian/credentials.ts` | Cifrado/descifrado de credenciales Factus por tenant |
| `lib/storefront/types.ts` | Tipos de la tienda pública, incluidas las filas de los RPC `get_storefront_order_*` |
| `lib/storefront/icon.tsx` | Generación del ícono dinámico de instalación |

## `backend/migrations/` — orden y contenido

| # | Archivo | Qué agrega |
|---|---|---|
| 01 | `01_schema.sql` | Esquema base: tenants, memberships, products, orders, invoices, etc. |
| 02 | `02_functions.sql` | Funciones (cálculo de IVA por línea, numeración DIAN, helpers `SECURITY DEFINER`) |
| 03 | `03_rls.sql` | Row-Level Security en todas las tablas |
| 04 | `04_metrics.sql` | Vistas de métricas por negocio |
| 05 | `05_seed.sql` | Semilla de datos (clasificación de IVA de ejemplo — validar con contador) |
| 06 | `06_onboarding.sql` | RPC de registro de negocio nuevo en trial |
| 07 | `07_catalog_rls.sql` | RLS específica del catálogo |
| 08 | `08_metrics_live.sql` | Vista materializada de ventas diarias |
| 09 | `09_grants.sql` | Permisos sobre vistas/funciones |
| 10 | `10_metrics_rls.sql` | RLS de las vistas de métricas |
| 11 | `11_subscription_rls.sql` | RLS de `subscriptions`/`platform_invoices` (permite a un dueño de negocio tocar su propia suscripción) |
| 12 | `12_invoice_error_tracking.sql` | Columna `invoices.dian_error` para reintentos sin pérdida silenciosa |
| 13 | `13_plan_gating.sql` | Límites y features por plan (`max_products`, `max_staff`, etc.) |
| 14 | `14_dian_credentials.sql` | Columna cifrada de credenciales Factus por tenant |
| 15 | `15_storefront.sql` | Vistas públicas `v_storefront_*`, `create_storefront_order`, `get_storefront_order_status` |
| 16 | `16_realtime_orders.sql` | Habilita Realtime sobre `orders` |
| 17 | `17_storefront_payment.sql` | Método de pago `wompi_online`, `get_storefront_order_total` |
| 18 | `18_fix_upsert_indexes.sql` | Corrige el índice parcial que rompía el `upsert` del webhook ante reintentos de Wompi |
