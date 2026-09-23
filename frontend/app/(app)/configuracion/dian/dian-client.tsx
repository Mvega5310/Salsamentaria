"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDianCredentials } from "./actions";

export default function DianConfigClient({
  alreadyConfigured,
}: {
  alreadyConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await saveDianCredentials(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[560px] p-6">
      <h1 className="mb-1 font-display text-[22px] font-extrabold tracking-tight text-ink">
        Facturación DIAN
      </h1>
      <p className="mb-5 text-[12.5px] text-muted">
        Credenciales de tu cuenta Factus. Se guardan cifradas — nadie, ni
        nosotros consultando la base de datos directamente, puede leerlas en
        texto plano.
      </p>

      {alreadyConfigured && !saved ? (
        <div className="mb-5 rounded-xl2 bg-[#DFEAE2] px-4 py-3 text-[12.5px] font-semibold text-[#2E5340]">
          Ya hay credenciales configuradas. Guardar el formulario las
          reemplaza.
        </div>
      ) : null}

      {saved ? (
        <div className="mb-5 rounded-xl2 bg-[#DFEAE2] px-4 py-3 text-[12.5px] font-semibold text-[#2E5340]">
          Credenciales guardadas. El botón de factura DIAN en el POS ya
          debería estar disponible (si tu plan lo incluye y está pagado).
        </div>
      ) : null}

      <div className="mb-5 rounded-xl2 bg-[#FAEBD5] px-4 py-3 text-[11.5px] leading-relaxed text-[#96601A]">
        Guardar aquí no verifica las credenciales contra Factus en vivo —
        solo las cifra y las guarda. El primer intento real de facturar es
        cuando se confirma que funcionan. Si Factus las rechaza, el pedido
        queda con el motivo exacto en su historial (no se pierde la venta).
      </div>

      <form action={submit} className="flex flex-col gap-3 rounded-xl2 border border-borde bg-white p-5">
        <Field label="Client ID">
          <input name="clientId" required className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa" />
        </Field>
        <Field label="Client Secret">
          <input name="clientSecret" type="password" required className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa" />
        </Field>
        <Field label="Usuario">
          <input name="username" required className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa" />
        </Field>
        <Field label="Contraseña">
          <input name="password" type="password" required className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa" />
        </Field>
        <Field label="Rango de numeración (asignado por Factus)">
          <input name="numberingRangeId" type="number" min="1" required className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa" />
        </Field>

        {error ? (
          <div className="rounded-xl2 bg-[#F6DED6] px-4 py-3 text-[12.5px] font-semibold text-curado">
            {error}
          </div>
        ) : null}

        <button
          disabled={pending}
          className="h-[50px] rounded-xl2 bg-salsa text-[13.5px] font-bold text-crema hover:bg-curado disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar credenciales"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
