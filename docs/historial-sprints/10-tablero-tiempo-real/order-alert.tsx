"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Beep de dos tonos generado con Web Audio — nada que licenciar ni alojar. */
function playAlertSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const tones = [880, 1180];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.16 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.16);
      osc.stop(ctx.currentTime + i * 0.16 + 0.15);
    });
  } catch {
    // Si el navegador bloquea audio sin interacción previa, no pasa nada —
    // el aviso visual y el refresco del tablero igual ocurren.
  }
}

export default function OrderAlert({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const supabase = useRef(createClient());

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifPermission(Notification.permission);
    else setNotifPermission("unsupported");
  }, []);

  useEffect(() => {
    const channel = supabase.current
      .channel(`orders-tenant-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const order = payload.new as { code: string | null; channel: string };
          if (order.channel !== "pwa") return; // solo alertar pedidos que el negocio no sabía que venían

          playAlertSound();
          setToast(`Pedido nuevo en línea — ${order.code ?? ""}`);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Pedido nuevo", { body: order.code ?? "Llegó un pedido de la tienda en línea" });
          }
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.current.removeChannel(channel);
    };
  }, [tenantId, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  function requestNotifications() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(setNotifPermission);
  }

  return (
    <>
      {notifPermission === "default" ? (
        <button
          onClick={requestNotifications}
          className="rounded-full border border-borde bg-crema px-3.5 py-2 text-[11.5px] font-semibold text-muted hover:bg-crema2"
        >
          Activar alertas de escritorio
        </button>
      ) : null}

      {toast ? (
        <div className="fixed right-5 top-5 z-50 rounded-xl2 bg-ink px-5 py-3.5 text-[13px] font-bold text-crema shadow-lg">
          🔔 {toast}
        </div>
      ) : null}
    </>
  );
}
