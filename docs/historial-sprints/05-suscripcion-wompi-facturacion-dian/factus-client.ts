/**
 * Cliente de Factus (Colombia) — facturación electrónica DIAN.
 *
 * IMPORTANTE — multi-tenant: cada salsamentaría tiene su propio NIT y su
 * propia habilitación DIAN, así que este cliente NUNCA lee credenciales de
 * variables de entorno globales — las recibe por parámetro en cada llamada
 * (desatadas desde tenants.dian_credentials, cifradas — ver migración 14 y
 * lib/dian/credentials.ts). El caché de token es por conjunto de
 * credenciales (clave = client_id), no global, para no mezclar tokens entre
 * negocios distintos.
 *
 * CONFIANZA DE ESTA IMPLEMENTACIÓN — léase antes de usar en producción:
 * - El modelo de autenticación (OAuth2, grant_type "password" con
 *   client_id/client_secret/username/password) está confirmado contra un
 *   SDK de terceros publicado (cotopaco/laravel-factus-sdk).
 * - La URL base y las rutas exactas de los endpoints (token, crear factura,
 *   descargar PDF/XML) NO pude confirmarlas en vivo — la documentación
 *   oficial de Factus está detrás de un login. Ajusta las rutas si tu
 *   documentación dice algo distinto — este es el único archivo a tocar.
 */

const BASE_URL = process.env.FACTUS_API_URL ?? "https://api.factus.com.co/v1";

export type FactusCredentials = {
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
  numbering_range_id: number;
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(creds: FactusCredentials): Promise<string> {
  const cached = tokenCache.get(creds.client_id);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      username: creds.username,
      password: creds.password,
    }),
  });

  if (!res.ok) {
    throw new Error(`Factus auth falló (${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  tokenCache.set(creds.client_id, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}

async function factusFetch<T>(
  creds: FactusCredentials,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken(creds);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Factus ${path} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

export type FactusInvoicePayload = Record<string, unknown>;

export type FactusInvoiceResult = {
  cufe: string;
  status: string;
  pdfUrl: string | null;
  xmlUrl: string | null;
  raw: Record<string, unknown>;
};

/**
 * Crea y valida una factura ante la DIAN.
 * ⚠️ Ruta y forma exacta de la respuesta (nombres de campo cufe/pdf/xml)
 * sin confirmar en vivo — verificar contra la documentación de tu cuenta
 * y ajustar el mapeo de la respuesta si difiere.
 */
export async function createInvoice(
  creds: FactusCredentials,
  payload: FactusInvoicePayload,
): Promise<FactusInvoiceResult> {
  const res = await factusFetch<Record<string, any>>(creds, "/bills/validate", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const data = res.data ?? res;
  return {
    cufe: data.cufe ?? data.bill?.cufe ?? "",
    status: data.status ?? "emitida",
    pdfUrl: data.pdf_url ?? data.bill?.pdf ?? null,
    xmlUrl: data.xml_url ?? data.bill?.xml ?? null,
    raw: res,
  };
}

export async function getInvoice(creds: FactusCredentials, billNumber: string) {
  return factusFetch<Record<string, unknown>>(creds, `/bills/${billNumber}`);
}
