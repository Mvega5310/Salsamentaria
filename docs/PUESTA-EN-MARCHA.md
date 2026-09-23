# Puesta en marcha

Guía paso a paso para levantar SalsaPOS desde cero: base de datos, app local y despliegue. Ver `docs/ARQUITECTURA.md` para el porqué de cada decisión.

## 1. Crear el proyecto Supabase

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com).
2. En **SQL Editor**, corre las 18 migraciones de `backend/migrations/` **en orden** (01 → 18) — cada una asume que las anteriores ya corrieron. También puedes usar `supabase db push` si conectas el CLI al proyecto.
3. En **Project Settings → API**, copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secreta — solo la usan las rutas `api/webhooks/wompi` y `api/cron/charge-subscriptions`, nunca el navegador)
4. (Opcional, recomendado) Programa el refresco de la vista materializada de métricas:
   ```sql
   select cron.schedule('refresh_metrics','*/10 * * * *','select refresh_metrics()');
   ```

## 2. Configurar `frontend/.env.local`

```bash
cd frontend
cp .env.example .env.local
```

Completa cada variable — el propio `.env.example` trae el porqué de cada una en comentarios. Resumen:

| Variable | De dónde sale | Requerida para |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Toda la app (sin esto, cualquier ruta da 500 en el middleware de sesión) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Webhook de Wompi y cron de cobro |
| `NEXT_PUBLIC_SITE_URL` | Tu dominio (local: `http://localhost:3000`) | Construir la `redirect_url` del checkout de Wompi |
| `WOMPI_ENV`, `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` | [comercios.wompi.co](https://comercios.wompi.co) (sandbox primero) | Suscripción del SaaS y pago en línea de la tienda pública |
| `FACTUS_API_URL` | Cuenta Factus del negocio — **verificar la URL real**, ver `frontend/lib/dian/mapping.ts` | Facturación electrónica DIAN desde el POS |
| `FACTUS_CONFIG_ENCRYPTION_KEY` | Generar una vez con `openssl rand -hex 32` | Cifrar credenciales Factus por tenant (nunca cambiarla después de guardar credenciales, o quedan indescifrables) |
| `CRON_SECRET` | Cualquier valor largo aleatorio, mismo valor en Vercel | Autenticar el cron diario de cobro |

## 3. Correr localmente

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Crea tu primer usuario desde el dashboard de Supabase (Authentication → Add user) y entra a `/onboarding` ya con sesión iniciada para crear el primer negocio (trial de 14 días vía RPC).

## 4. Desplegar (Vercel)

1. Conecta el repo a Vercel, con **root directory = `frontend`** (el resto del repo no es parte del deploy).
2. Configura en el proyecto de Vercel las mismas variables de `.env.example`, con valores de producción (no los de sandbox).
3. `vercel.json` (dentro de `frontend/`) ya define el cron diario de `api/cron/charge-subscriptions` — Vercel inyecta `CRON_SECRET` automáticamente en el header `Authorization` de esa llamada si la variable existe en el proyecto.
4. Registra la URL de producción del webhook en el dashboard de Wompi: `https://tu-dominio/api/webhooks/wompi` — sandbox y producción son URLs/llaves separadas en Wompi, regístralas por separado.

## 5. Qué no se puede terminar sin cuentas reales

Estos pasos dependen de servicios externos y no se pueden validar desde este entorno:

- Confirmar que `lib/dian/mapping.ts` calza con la cuenta Factus real (su documentación está tras login).
- Probar el webhook de Wompi con una transacción real de sandbox.
- Probar Supabase Realtime en el tablero (el linter/build no levanta el servidor Realtime, solo Postgres).
- Verificar la clasificación de IVA sembrada en `05_seed.sql` con el contador del negocio.
