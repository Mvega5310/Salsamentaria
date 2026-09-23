import type { Metadata, Viewport } from "next";
import { createClient } from "@/lib/supabase/server";
import RegisterServiceWorker from "./register-sw";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data: tenant } = await supabase
    .from("v_storefront_tenant")
    .select("name")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!tenant) return { title: "Tienda no encontrada" };

  return {
    title: tenant.name,
    description: `Pide en línea en ${tenant.name}`,
    manifest: `/tienda/${params.slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: "default", title: tenant.name },
    icons: {
      icon: [{ url: `/tienda/${params.slug}/icon-192`, sizes: "192x192", type: "image/png" }],
      apple: [{ url: `/tienda/${params.slug}/icon-192`, sizes: "192x192", type: "image/png" }],
    },
  };
}

export async function generateViewport({
  params,
}: {
  params: { slug: string };
}): Promise<Viewport> {
  const supabase = createClient();
  const { data: tenant } = await supabase
    .from("v_storefront_tenant")
    .select("brand_primary")
    .eq("slug", params.slug)
    .maybeSingle();

  return {
    themeColor: tenant?.brand_primary ?? "#B23A1E",
    width: "device-width",
    initialScale: 1,
  };
}

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegisterServiceWorker />
      {children}
    </>
  );
}
