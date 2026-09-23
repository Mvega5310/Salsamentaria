import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { buildIconElement } from "@/lib/storefront/icon";

// Runtime Node (por defecto) para reutilizar el mismo cliente Supabase que
// el resto de la app — next/og funciona en ambos runtimes desde Next 13.4+.
const SIZE = 192;

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createClient();
  const { data: tenant } = await supabase
    .from("v_storefront_tenant")
    .select("name, brand_primary")
    .eq("slug", params.slug)
    .maybeSingle();

  return new ImageResponse(
    buildIconElement(tenant?.name ?? "SalsaPOS", tenant?.brand_primary ?? "#B23A1E", SIZE),
    { width: SIZE, height: SIZE },
  );
}
