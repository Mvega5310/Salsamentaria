// Service worker de la tienda pública (SalsaPOS).
// Alcance: /tienda/ únicamente (ver register-sw.tsx) — nunca cachea nada
// del panel del negocio (/pos, /tablero, etc.), que vive en otro origen de
// confianza y necesita datos siempre frescos.
const CACHE = "salsapos-tienda-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET del mismo origen dentro de /tienda/ — nunca interceptar
  // envíos de pedido (POST) ni llamadas a Supabase.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/tienda/")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Response.error())),
  );
});
