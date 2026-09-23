"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signIn, type LoginState } from "./actions";

const initial: LoginState = { error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-[54px] rounded-xl2 bg-salsa font-bold text-[15px] text-crema hover:bg-curado disabled:opacity-60"
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(signIn, initial);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-[380px] rounded-xl3 border border-borde bg-crema p-8 shadow-[0_12px_34px_rgba(42,28,22,.14)]">
        <div className="mb-1 font-display text-[28px] font-extrabold tracking-tight text-salsa">
          SalsaPOS
        </div>
        <p className="mb-7 text-[12.5px] text-muted">
          Punto de venta para salsamentarías
        </p>

        <form action={action} className="flex flex-col gap-3">
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Correo"
            className="h-[50px] rounded-xl2 border border-borde bg-white px-4 text-[13.5px] outline-none focus:border-salsa"
          />
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Contraseña"
            className="h-[50px] rounded-xl2 border border-borde bg-white px-4 text-[13.5px] outline-none focus:border-salsa"
          />
          {state.error ? (
            <div className="rounded-xl2 bg-[#F6DED6] px-4 py-3 text-[12.5px] font-semibold text-curado">
              {state.error}
            </div>
          ) : null}
          <SubmitButton />
        </form>
      </div>
    </main>
  );
}
