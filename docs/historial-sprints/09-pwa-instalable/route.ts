import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createClient();
  const { data: tenant } = await supabase
    .from("v_storefront_tenant")
    .select("name, brand_primary, brand_bg")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!tenant) {
    return new Response("Negocio no encontrado", { status: 404 });
  }

  const manifest = {
    name: tenant.name,
    short_name: tenant.name.slice(0, 12),
    description: `Pide en línea en ${tenant.name}`,
    // scope/start_url acotados a ESTE negocio — instalar la tienda de un
    // negocio no debe poder "salirse" a la de otro dentro de la app instalada.
    start_url: `/tienda/${params.slug}`,
    scope: `/tienda/${params.slug}`,
    display: "standalone",
    background_color: tenant.brand_bg,
    theme_color: tenant.brand_primary,
    icons: [
      { src: `/tienda/${params.slug}/icon-192`, sizes: "192x192", type: "image/png" },
      { src: `/tienda/${params.slug}/icon-512`, sizes: "512x512", type: "image/png" },
    ],
  };

  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
