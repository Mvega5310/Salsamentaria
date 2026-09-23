# SalsaPOS — Arquitectura de la plataforma

Sistema POS + PWA multi-inquilino para salsamentarías, ofrecido por **venta única** o **suscripción**. Este documento describe la base construida y la hoja de ruta.

> **Estado:** capa de datos lista para correr (esquema, RLS, funciones, métricas, semilla). Las capas de aplicación (Next.js), pasarela de pago y conector DIAN se construyen encima.

---

## 1. Decisiones de arquitectura

| Tema | Decisión | Por qué |
|---|---|---|
| Multi-tenancy | Base única + `tenant_id` + Row-Level Security | Estándar de Supabase; un solo despliegue sirve a N negocios; costo operativo bajo. |
| Aislamiento | RLS en **todas** las tablas, resuelto por `memberships` | Nadie ve datos de otro negocio, garantizado en el motor, no en el código. |
| IVA | Régimen **por producto**, precio guardado IVA-incluido | Corrige el `÷1,19` global; una salsamentaría mezcla excluidos, exentos y gravados. |
| Cobro del SaaS | Planes + suscripción, agnóstico de pasarela | Soporta mensual, anual y venta perpetua con mantenimiento. |
| Facturación cliente | Dual: electrónica DIAN + recibo interno | Requisito legal + práctica de mostrador. |
| Métricas | Vistas SQL + 1 vista materializada | Frescas, sin duplicar lógica en la app; escala con índices. |

---

## 2. Modelo de datos (resumen)

```
PLATAFORMA          NEGOCIO (tenant)              VENTA
──────────          ────────────────              ─────
plans               tenants ──┐                   orders ──┬── order_items
subscriptions ──────┘         ├── categories               ├── order_status_history
platform_invoices             ├── products                 ├── payments
platform_admins               ├── customers                └── invoices ── invoice_sequences
profiles / memberships        └── inventory_movements
```

- **`tenants`** — cada salsamentaría: marca (colores/logo para white-label del PWA), NIT, config DIAN, domicilio por defecto.
- **`memberships`** — usuario ↔ tenant ↔ rol (`propietario`, `administrador`, `cajero`, `domiciliario`).
- **`products`** — precio IVA-incluido, `tax_regime`, `unit`/`step` (venta por peso o unidad), inventario opcional, `cost` para margen.
- **`orders` / `order_items`** — los ítems **congelan snapshots** (nombre, precio, régimen) para que la factura sea inmutable aunque el producto cambie después.
- **`invoices`** — misma estructura para recibo interno y factura electrónica; se llena el CUFE/URLs cuando el proveedor DIAN responde.

---

## 3. Cómo se calcula el IVA (el arreglo del diseño)

El precio se guarda **IVA incluido** (lo que se ve en el mostrador). En cada línea:

```
line_total    = unit_price × qty            -- lo que paga el cliente
line_subtotal = line_total / (1 + tasa)     -- base
line_tax      = line_total − line_subtotal
```

La tasa sale del régimen del producto (`tax_rate_for`): `gravado_19` → 19 %, `gravado_5` → 5 %, `exento`/`excluido` → 0 %. Los totales del pedido se recalculan por trigger. Así, un ticket con queso costeño (excluido) y jamón (gravado) reporta el IVA **exacto por producto**, no un 19 % plano.

> La clasificación sembrada en `05_seed.sql` es un punto de partida y **debe validarla el contador del negocio**. El modelo ya soporta cualquier combinación.

---

## 4. Suscripción, venta y mantenimiento

- **`plans`**: `basico` (mensual), `pro` (mensual, con DIAN e inventario), `perpetuo` (venta única + mantenimiento). Cada plan lleva `features` (JSON) y límites (`max_products`, `max_staff`, `max_orders_month`) para *gating* en la app.
- **`subscriptions`**: estado (`trialing`/`activa`/`vencida`/`suspendida`/`cancelada`), periodo actual, y `provider`/`provider_ref` para la pasarela (Wompi, Bold o Mercado Pago).
- **Mantenimiento**: se factura vía `platform_invoices` (concepto libre: "Mantenimiento anual", "Setup", "Soporte"). Un tenant que no paga pasa a `suspendido` y su RLS sigue aislando sus datos.
- **Gating recomendado**: middleware en Next.js lee la suscripción activa del tenant y bloquea features fuera del plan (p. ej. botón "Factura DIAN" solo si `features.dian = true`).

---

## 5. Facturación DIAN

1. La app arma el pedido y marca `needs_invoice = true`.
2. Un endpoint (server-side) toma el siguiente consecutivo con `next_invoice_number(tenant, 'FE')` y llama al proveedor (**Factus/Alegra**) con los ítems y sus impuestos por línea.
3. El proveedor devuelve CUFE, XML y PDF; se guardan en `invoices` y el estado pasa a `aceptada`.
4. El PDF se envía por WhatsApp al cliente (integración pendiente).

Las credenciales DIAN **no** se guardan en texto plano en `dian_config`; usar Supabase Vault o variables de entorno por tenant.

---

## 6. Catálogo de métricas (dashboard)

Por negocio (respetan RLS):

- `mv_daily_sales` — ventas diarias, ticket promedio, IVA (materializada).
- `v_top_products` — más vendidos (30 días).
- `v_sales_by_category`, `v_sales_by_channel` — mezcla de venta.
- `v_payment_mix` — medios de pago.
- `v_fulfillment_time` — minutos promedio de "recibido" a "entregado".
- `v_product_margin` — margen bruto (usa `cost`).
- `v_waste` — merma/pérdida (clave en salsamentaría).
- `v_tax_by_regime` — base e IVA por régimen (conciliación DIAN).

Para la plataforma (solo admin): `v_platform_mrr` (MRR, suscripciones activas) y `v_platform_tenants` (embudo trial → activo → churn).

Refrescar la materializada con `pg_cron`:
```sql
select cron.schedule('refresh_metrics','*/10 * * * *','select refresh_metrics()');
```

---

## 7. Seguridad

- RLS activo en todas las tablas; helpers `user_tenant_ids()`, `is_platform_admin()`, `has_tenant_role()` son `SECURITY DEFINER` para evitar recursión.
- Roles: el `cajero` opera ventas; `administrador`/`propietario` editan catálogo, staff y negocio; `platform_admin` gestiona planes y suscripciones.
- Las vistas usan `security_invoker = true`: heredan el RLS del usuario que consulta.
- Numeración DIAN con bloqueo de fila (`next_invoice_number`) para no repetir consecutivos bajo concurrencia.

---

## 8. Operación

- **Migraciones**: `supabase/migrations/*.sql` en orden (01→05). Correr con `supabase db push` o el editor SQL.
- **Backups**: respaldos automáticos de Supabase + `pg_dump` semanal recomendado.
- **Índices**: ya incluidos para las consultas calientes (pedidos por tenant/fecha/estado, búsqueda de producto por trigram).

---

## 9. Integraciones externas — decisiones cerradas

**DIAN: Factus.** Elegido sobre Alegra porque es una API pura (nosotros somos
la interfaz; Factus solo valida y timbra), evitando que cada salsamentaría
necesite una segunda suscripción SaaS encima de la nuestra.

**Suscripción del SaaS: Wompi.** Elegido sobre Bold porque su API de fuentes
de pago (tokenización + cobro recurrente) está documentada y confirmada
en vivo — es exactamente el caso de uso de cobrar el plan mensual a cada
tenant. Bold queda como candidato futuro para el checkout de cada negocio
con sus propios clientes (un trabajo distinto, no cerrado todavía).

**Nivel de confianza de cada integración — léase antes de ir a producción:**

| | Confirmado en vivo | Verificar antes de producción |
|---|---|---|
| **Wompi** (`lib/billing/wompi.ts`) | Modelo de auth (public/private key), tokenización de tarjeta, fuentes de pago, checksum de integridad, firma de webhooks — todo contra docs.wompi.co | Nada crítico pendiente; falta programar el cron mensual de cobro (ver abajo) |
| **Factus** (`lib/dian/factus-client.ts`, `lib/dian/mapping.ts`) | Modelo de autenticación OAuth2 (grant_type password) | **URL base, rutas exactas de endpoints, y forma exacta de los campos de línea de factura** (`lib/dian/mapping.ts` está marcado con TODOs específicos) — su documentación está detrás de login y no pude verificarla en vivo |

El diseño aísla esta incertidumbre a propósito: si algo de Factus no calza,
solo hay que tocar `lib/dian/mapping.ts` — el resto del sistema (POS,
pedidos, facturas) no sabe nada de la forma exacta de su API.

**Flujo implementado:**
- POS → al elegir "factura DIAN" pide documento del comprador (obligatorio
  para facturar) → guarda la venta → intenta emitir contra Factus →
  si falla, la venta queda cobrada igual y el error queda en
  `invoices.dian_error` para reintentar, nunca se pierde silenciosamente.
- `/suscripcion` → el dueño tokeniza su tarjeta directo en el navegador
  (nunca toca nuestro servidor) → la guarda como fuente de pago reutilizable
  → botón de cobro manual para probar el flujo end-to-end.
- `/api/webhooks/wompi` → única fuente de verdad sobre pagos: el cliente
  nunca escribe `platform_invoices` directamente, solo el webhook, verificado
  por firma criptográfica.

**Huecos de permisos encontrados y cerrados al construir esto** (migración 11):
las políticas RLS del sprint de suscripciones solo dejaban a un admin de
*plataforma* tocar `subscriptions` y `platform_invoices` — un dueño de
negocio no podía ni guardar su propia tarjeta ni ver su historial de cobros.
Se resolvió con una función `SECURITY DEFINER` estrecha (solo toca
`provider`/`provider_ref`, nunca `plan_id` ni `status`) en vez de abrir la
tabla completa.

**Pendiente para producción:**
- [ ] Cron mensual que llame `chargePaymentSource` por cada suscripción vencida (Vercel Cron / Supabase Edge Function — no se puede programar desde esta conversación)
- [ ] Registrar la URL de `/api/webhooks/wompi` en el dashboard de Wompi (sandbox y producción por separado)
- [ ] Verificar los TODOs de `lib/dian/mapping.ts` contra la cuenta real de Factus
- [ ] UI para que cada tenant cargue sus credenciales Factus y active `dian_enabled` (hoy es un paso manual por SQL)
- [ ] Mover credenciales de `tenants.dian_config` (hoy jsonb en claro) a Supabase Vault

---

## 12. PWA del cliente (tienda pública)

Catálogo público en `/tienda/<slug>`, con la marca del negocio (logo, color
primario) aplicada dinámicamente vía variables CSS — no hay build por
tenant, un mismo despliegue sirve a todos.

**Acceso sin cuenta.** El rol `anon` de Supabase no tiene membership, así
que en vez de abrirle las tablas reales (`tenants`, `products`, `orders` —
lo que expondría NIT, credenciales DIAN y costos), se expusieron:
- Tres vistas de solo lectura (`v_storefront_*`) con únicamente las columnas
  seguras — probé en vivo que la vista de tenant no tiene ni una columna de
  facturación.
- `create_storefront_order`: arma el pedido completo en una sola función,
  validando que cada producto pertenezca al tenant correcto (evita ids
  adivinados de otro negocio) y dejando que los triggers existentes
  calculen IVA y totales — el cliente PWA nunca toca `orders`/`order_items`
  directamente.
- `get_storefront_order_status`: confirma un pedido por id exacto (UUID
  impredecible), sin capacidad de listar — probé que `anon` no puede leer
  la tabla `orders` de ninguna otra forma.

**Pago.** El checkout público cobra en `efectivo`/`contra_entrega`/
`transferencia` (coordinada aparte) — no hay pasarela en línea todavía. Esa
es la decisión de Bold que quedó pendiente en la sección 9, para cuando se
quiera cobro con tarjeta en el checkout del cliente final.

**Bug encontrado al construir esto:** el middleware de sesión protegía
`/api/webhooks/wompi` y `/api/cron/charge-subscriptions` con el mismo
guardián de `/pos` — como esas llamadas no traen cookie de usuario, las
estaba redirigiendo a `/login` en vez de dejarlas pasar. Sin la tienda
pública nadie lo hubiera notado hasta que Wompi empezara a fallar en
producción. Corregido en `lib/supabase/middleware.ts`.

**Pendiente:**
- [ ] Notificación al negocio (WhatsApp/push) cuando llega un pedido nuevo
- [ ] Pasarela de pago en el checkout del cliente final (Bold, pendiente de decisión)

**Instalación como PWA (cerrado):** cada negocio tiene su propio manifest e
íconos — no hay una sola app compartida entre todos. `/tienda/<slug>/manifest.webmanifest`
se genera por request con el nombre y color del negocio; los íconos
(`icon-192`, `icon-512`) se generan dinámicamente con la inicial del
nombre sobre su color de marca, así que un negocio es instalable desde el
primer día sin necesidad de subir un logo. `scope`/`start_url` del manifest
quedan acotados a `/tienda/<slug>`: instalar la tienda de un negocio no
puede "salirse" hacia la de otro dentro de la app instalada.

El service worker (`public/sw.js`) es network-first con reserva en caché,
y se registra con `scope: '/tienda/'` — nunca toca ni cachea nada del panel
del negocio (`/pos`, `/tablero`), que necesita datos siempre frescos.

---

## 13. Hoja de ruta

**Construido**
- [x] Esquema multi-tenant completo, RLS de aislamiento por negocio
- [x] IVA por producto + totales automáticos
- [x] Planes, suscripciones y facturación del SaaS
- [x] Numeración DIAN y estructura de facturación dual
- [x] Capa de métricas (negocio + plataforma), con vistas restringidas a roles admin
- [x] App Next.js: POS mostrador, tablero, catálogo, dashboard de métricas
- [x] Onboarding de negocio (trial de 14 días vía RPC seguro)
- [x] Integración Wompi (cobro recurrente de la suscripción)
- [x] Integración Factus (facturación DIAN desde el POS, credenciales por tenant cifradas)
- [x] *Gating* por plan (dos condiciones: plan lo incluye Y suscripción pagada)
- [x] Cron de cobro mensual + configuración DIAN por negocio
- [x] PWA del cliente (catálogo público + pedido sin cuenta)
- [x] Instalación real como PWA (manifest e íconos dinámicos por negocio, service worker)

**Siguiente**
- [ ] Pasarela de pago en el checkout del cliente final (Bold)
- [ ] Notificación al negocio cuando llega un pedido nuevo
- [ ] Agente de impresora térmica (mostrador)
- [ ] Pantalla de pesaje con balanza conectada

---

## 14. Puntos que necesito confirmar

1. **Clasificación de IVA real** de los productos (con el contador) para reemplazar la semilla.
2. **Pasarela para el checkout de cada salsamentaría con sus propios clientes** (posible candidato: Bold).
