"use client";

import { useEffect } from "react";

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/tienda/" })
      .catch(() => {
        // La tienda funciona igual sin service worker — solo se pierde la
        // instalación offline-friendly, no es un error que deba interrumpir nada.
      });
  }, []);

  return null;
}
