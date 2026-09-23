# SalsaPOS — Frontend (Next.js 14)

App operativa sobre el esquema Supabase de `../supabase/migrations`.

## Qué incluye esta entrega

- **Auth** con Supabase (correo + contraseña) y refresco de sesión por middleware.
- **Contexto de tenant**: resuelve el negocio y rol del usuario; el RLS de la BD hace el aislamiento.
- **POS de mostrador** (`/pos`): catálogo, ticket con **IVA calculado por producto**, medio de pago, y cobro como recibo interno o factura DIAN. Crea la venta real (pedido + ítems + pago + comprobante) usando los triggers de la BD.
- **Tablero** (`/tablero`): pedidos activos con avance de estado.
- **Onboarding** (`/onboarding`): registro de un negocio nuevo en trial (vía RPC seguro).

## Requisitos

- Node 18.18+ (o 20+)
- Un proyecto Supabase con las migraciones `01`→`06` aplicadas.

## Puesta en marcha

```bash
cp .env.example .env.local     # completa URL y anon key de tu proyecto
npm install
npm run dev                    # http://localhost:3000
```

Para crear el primer usuario: regístralo en Supabase (Auth) y, en el editor SQL,
vincúlalo a un negocio — o usa `/onboarding` tras iniciar sesión, que lo hace solo.

## Estructura

```
app/
  login/           inicio de sesión
  onboarding/      registro de negocio (trial)
  (app)/
    layout.tsx     guarda de sesión + negocio + barra
    pos/           POS de mostrador (page = servidor, pos-client = cliente, actions = venta)
    tablero/       tablero de pedidos
lib/
  supabase/        clientes navegador/servidor + middleware
  tenant.ts        contexto de negocio del usuario
  format.ts        COP, cantidades e IVA por línea (espeja la BD)
  types.ts         tipos de dominio
```

## Pendiente (siguientes capas)

- PWA del cliente (catálogo público con marca por tenant + checkout).
- Panel admin: catálogo, staff, métricas (sobre las vistas de `04_metrics.sql`).
- Conector DIAN (Factus/Alegra) + envío de PDF por WhatsApp.
- Pasarela de cobro de la suscripción (Wompi/Bold) y gating por plan.
- Realtime en el tablero (Supabase Realtime) y agente de impresora térmica.
