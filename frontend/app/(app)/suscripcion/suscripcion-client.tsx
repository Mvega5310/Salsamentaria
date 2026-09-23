"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cop } from "@/lib/format";
import { attachPaymentMethod, chargeNow, switchPlan } from "./actions";

type Subscription = {
  status: string;
  hasPaymentMethod: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  planCode: string;
  planName: string;
  planPrice: number;
  planInterval: string;
} | null;

type Plan = {
  code: string;
  name: string;
  description: string | null;
  price: number;
  interval: string;
  dianIncluded: boolean;
};

type Invoice = { concept: string; amount: number; status: string; date: string | null };

const STATUS_LABEL: Record<string, string> = {
  trialing: "Prueba gratuita",
  activa: "Activa",
  vencida: "Vencida",
  suspendida: "Suspendida",
  cancelada: "Cancelada",
};

const WOMPI_BASE: Record<string, string> = {
  sandbox: "https://sandbox.wompi.co/v1",
  production: "https://production.wompi.co/v1",
};

export default function SuscripcionClient({
  email,
  publicKey,
  env,
  subscription,
  plans,
  invoices,
  isPaidAndActive,
}: {
  email: string;
  publicKey: string;
  env: string;
  subscription: Subscription;
  plans: Plan[];
  invoices: Invoice[];
  isPaidAndActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ number: "", cvc: "", expMonth: "", expYear: "", holder: "" });
  const [error, setError] = useState("");
  const [step, setStep] = useState<"idle" | "tokenizing" | "saving">("idle");

  async function submitCard(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStep("tokenizing");

    try {
      // La tarjeta se tokeniza directo contra Wompi con la llave PÚBLICA —
      // los datos nunca pasan por nuestro backend.
      const res = await fetch(`${WOMPI_BASE[env]}/tokens/cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicKey}`,
        },
        body: JSON.stringify({
          number: form.number.replace(/\s/g, ""),
          cvc: form.cvc,
          exp_month: form.expMonth,
          exp_year: form.expYear,
          card_holder: form.holder,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.messages?.number?.[0] ?? "Tarjeta rechazada. Verifica los datos.");
        setStep("idle");
        return;
      }

      setStep("saving");
      startTransition(async () => {
        const result = await attachPaymentMethod({ cardToken: body.data.id, email });
        setStep("idle");
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      });
    } catch {
      setError("No se pudo conectar con Wompi. Intenta de nuevo.");
      setStep("idle");
    }
  }

  function runChargeNow() {
    setError("");
    startTransition(async () => {
      const result = await chargeNow();
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function runSwitchPlan(code: string) {
    setError("");
    startTransition(async () => {
      const result = await switchPlan(code);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[720px] p-6">
      <h1 className="mb-5 font-display text-[22px] font-extrabold tracking-tight text-ink">
        Suscripción
      </h1>

      {subscription ? (
        <div className="mb-5 rounded-xl2 border border-borde bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] font-bold text-ink">{subscription.planName}</div>
              <div className="text-[12.5px] text-muted">
                {cop(subscription.planPrice)} / {subscription.planInterval}
              </div>
            </div>
            <span className="rounded-full bg-crema2 px-3 py-1.5 text-[11.5px] font-bold text-muted">
              {STATUS_LABEL[subscription.status] ?? subscription.status}
            </span>
          </div>
          {subscription.status === "trialing" && subscription.trialEndsAt ? (
            <div className="mt-3 rounded-xl2 bg-crema2 px-3.5 py-2.5 text-[12.5px] text-muted">
              Tu prueba termina el{" "}
              {new Date(subscription.trialEndsAt).toLocaleDateString("es-CO", {
                day: "numeric",
                month: "long",
              })}
              . Agrega un método de pago para que no se interrumpa el servicio.
            </div>
          ) : null}
          {!isPaidAndActive && subscription.planCode === "pro" ? (
            <div className="mt-3 rounded-xl2 bg-[#FAEBD5] px-3.5 py-2.5 text-[12.5px] text-[#96601A]">
              Estás en plan Pro, pero las funciones Pro (factura DIAN,
              métricas avanzadas) solo se activan cuando el primer cobro se
              confirme.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-5 rounded-xl2 border border-borde bg-white p-5">
        <div className="mb-1 text-[13px] font-bold text-ink">Plan</div>
        <div className="mb-4 text-[11.5px] text-muted">
          Cambiar de plan actualiza lo que se cobra en el próximo pago — no
          activa nada hasta que el cobro se confirme.
        </div>
        <div className="grid grid-cols-2 gap-3">
          {plans.map((p) => {
            const active = p.code === subscription?.planCode;
            return (
              <button
                key={p.code}
                disabled={pending || active}
                onClick={() => runSwitchPlan(p.code)}
                className={`rounded-xl2 border p-3.5 text-left ${
                  active ? "border-salsa bg-[#FDF1EC]" : "border-borde bg-white hover:border-salsa"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-ink">{p.name}</span>
                  {active ? (
                    <span className="rounded-full bg-salsa px-2 py-0.5 text-[10px] font-bold text-crema">
                      Actual
                    </span>
                  ) : null}
                </div>
                <div className="tabular mt-1 text-[13px] font-bold text-salsa">
                  {cop(p.price)} <span className="font-medium text-muted">/{p.interval}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {p.dianIncluded ? "Incluye factura DIAN" : "Sin factura DIAN"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-5 rounded-xl2 border border-borde bg-white p-5">
        <div className="mb-1 text-[13px] font-bold text-ink">Método de pago</div>
        <div className="mb-4 text-[11.5px] text-muted">
          Procesado por Wompi. Tus datos de tarjeta nunca pasan por nuestros servidores.
        </div>

        {subscription?.hasPaymentMethod ? (
          <div className="flex items-center justify-between rounded-xl2 bg-crema2 px-4 py-3">
            <span className="text-[13px] font-semibold text-ink">
              Tarjeta guardada — lista para cobro automático
            </span>
            <button
              disabled={pending}
              onClick={runChargeNow}
              className="rounded-lg border border-borde bg-white px-3.5 py-2 text-[12px] font-semibold text-muted hover:bg-crema"
            >
              {pending ? "Procesando…" : "Cobrar ahora (prueba)"}
            </button>
          </div>
        ) : (
          <form onSubmit={submitCard} className="flex flex-col gap-3">
            <input
              placeholder="Número de tarjeta"
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              className="h-11 rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
            />
            <div className="flex gap-3">
              <input
                placeholder="MM"
                maxLength={2}
                value={form.expMonth}
                onChange={(e) => setForm({ ...form, expMonth: e.target.value })}
                className="h-11 w-[70px] rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
              />
              <input
                placeholder="AA"
                maxLength={2}
                value={form.expYear}
                onChange={(e) => setForm({ ...form, expYear: e.target.value })}
                className="h-11 w-[70px] rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
              />
              <input
                placeholder="CVC"
                maxLength={4}
                value={form.cvc}
                onChange={(e) => setForm({ ...form, cvc: e.target.value })}
                className="h-11 w-[90px] rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
              />
              <input
                placeholder="Nombre del titular"
                value={form.holder}
                onChange={(e) => setForm({ ...form, holder: e.target.value })}
                className="h-11 flex-1 rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
              />
            </div>

            {error ? (
              <div className="rounded-xl2 bg-[#F6DED6] px-4 py-3 text-[12.5px] font-semibold text-curado">
                {error}
              </div>
            ) : null}

            <button
              disabled={step !== "idle"}
              className="h-[50px] rounded-xl2 bg-salsa text-[13.5px] font-bold text-crema hover:bg-curado disabled:opacity-60"
            >
              {step === "tokenizing"
                ? "Verificando tarjeta…"
                : step === "saving"
                  ? "Guardando…"
                  : "Guardar método de pago"}
            </button>
          </form>
        )}
      </div>

      <div className="rounded-xl2 border border-borde bg-white p-5">
        <div className="mb-4 text-[13px] font-bold text-ink">Historial de cobros</div>
        {invoices.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-muted">
            Todavía no hay cobros registrados.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {invoices.map((i, idx) => (
              <div key={idx} className="flex items-center justify-between border-b border-borde py-2 last:border-0">
                <div>
                  <div className="text-[13px] font-semibold text-ink">{i.concept}</div>
                  <div className="text-[11.5px] text-muted">
                    {i.date ? new Date(i.date).toLocaleDateString("es-CO") : "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tabular text-[13px] font-bold text-ink">{cop(i.amount)}</div>
                  <div className="text-[11px] text-muted">{i.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
