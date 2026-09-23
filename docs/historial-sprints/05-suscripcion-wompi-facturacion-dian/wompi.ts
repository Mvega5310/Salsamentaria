import crypto from "crypto";

/**
 * Cliente de Wompi (Colombia) — API v1.
 * Fuente: docs.wompi.co (confirmado en vivo: fuentes de pago, tokens de
 * aceptación, checksum de integridad y firma de eventos). Base URLs por
 * ambiente; Wompi exige una URL de eventos distinta por ambiente también.
 */

const BASE_URL =
  process.env.WOMPI_ENV === "production"
    ? "https://production.wompi.co/v1"
    : "https://sandbox.wompi.co/v1";

const PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY!;
const PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY!;
const INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET!;
const EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET!;

async function wompiFetch<T>(
  path: string,
  init: RequestInit & { auth?: "public" | "private" } = {},
): Promise<T> {
  const key = init.auth === "public" ? PUBLIC_KEY : PRIVATE_KEY;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...init.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `Wompi ${path} → ${res.status}: ${JSON.stringify(body.error ?? body)}`,
    );
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// Tokens de aceptación — obligatorios en cualquier request que cree una
// transacción o fuente de pago (política de datos personales de Wompi).
// ---------------------------------------------------------------------------
export async function getAcceptanceTokens(): Promise<{
  acceptanceToken: string;
  personalAuthToken: string;
}> {
  const res = await wompiFetch<{
    data: {
      presigned_acceptance: { acceptance_token: string };
      presigned_personal_data_auth: { acceptance_token: string };
    };
  }>(`/merchants/${PUBLIC_KEY}`, { auth: "public" });

  return {
    acceptanceToken: res.data.presigned_acceptance.acceptance_token,
    personalAuthToken: res.data.presigned_personal_data_auth.acceptance_token,
  };
}

// ---------------------------------------------------------------------------
// Checksum de integridad — obligatorio en toda creación de transacción.
// SHA256(reference + amount_in_cents + currency + integrity_secret)
// ---------------------------------------------------------------------------
function integritySignature(reference: string, amountInCents: number, currency = "COP") {
  return crypto
    .createHash("sha256")
    .update(`${reference}${amountInCents}${currency}${INTEGRITY_SECRET}`)
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Guardar una fuente de pago (tarjeta ya tokenizada en el navegador con la
// llave pública) para poder cobrar de nuevo sin que el cliente vuelva a
// ingresar sus datos — esto es lo que habilita el cobro recurrente del SaaS.
// ---------------------------------------------------------------------------
export async function savePaymentSource(params: {
  cardToken: string;
  customerEmail: string;
}): Promise<{ paymentSourceId: number; lastStatus: string }> {
  const { acceptanceToken, personalAuthToken } = await getAcceptanceTokens();

  const res = await wompiFetch<{ data: { id: number; status: string } }>(
    "/payment_sources",
    {
      method: "POST",
      auth: "private",
      body: JSON.stringify({
        type: "CARD",
        token: params.cardToken,
        customer_email: params.customerEmail,
        acceptance_token: acceptanceToken,
        accept_personal_auth: personalAuthToken,
      }),
    },
  );

  return { paymentSourceId: res.data.id, lastStatus: res.data.status };
}

// ---------------------------------------------------------------------------
// Cobrar contra una fuente de pago guardada — esto es lo que corre cada mes
// (disparado por un cron) para facturar la suscripción de un tenant.
// ---------------------------------------------------------------------------
export async function chargePaymentSource(params: {
  paymentSourceId: number;
  amountInCents: number;
  reference: string;
  customerEmail: string;
  currency?: string;
}): Promise<{ transactionId: string; status: string }> {
  const currency = params.currency ?? "COP";
  const res = await wompiFetch<{ data: { id: string; status: string } }>(
    "/transactions",
    {
      method: "POST",
      auth: "private",
      body: JSON.stringify({
        amount_in_cents: params.amountInCents,
        currency,
        customer_email: params.customerEmail,
        reference: params.reference,
        payment_method: { installments: 1 },
        payment_source_id: params.paymentSourceId,
        signature: integritySignature(params.reference, params.amountInCents, currency),
      }),
    },
  );

  return { transactionId: res.data.id, status: res.data.status };
}

export async function getTransaction(id: string) {
  return wompiFetch<{ data: Record<string, unknown> }>(`/transactions/${id}`, {
    auth: "public",
  });
}

// ---------------------------------------------------------------------------
// Verificación de firma de webhook — SHA256 de los valores de
// signature.properties (en orden) + timestamp + events_secret.
// Rechaza cualquier evento que no traiga una firma válida: sin esto, alguien
// podría simular un pago exitoso y activar una suscripción sin pagar.
// ---------------------------------------------------------------------------
export function verifyWebhookSignature(payload: {
  data: Record<string, unknown>;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
}): boolean {
  const values = payload.signature.properties.map((path) => {
    // path tipo "transaction.id" → payload.data.transaction.id
    const parts = path.split(".").slice(1); // quita el prefijo "transaction"
    let v: unknown = payload.data.transaction;
    for (const p of parts) v = (v as Record<string, unknown>)?.[p];
    return String(v);
  });

  const toHash = values.join("") + payload.timestamp + EVENTS_SECRET;
  const expected = crypto.createHash("sha256").update(toHash).digest("hex");
  return expected === payload.signature.checksum;
}

export const wompiPublicKey = PUBLIC_KEY;
export const wompiEnv = process.env.WOMPI_ENV === "production" ? "production" : "sandbox";
