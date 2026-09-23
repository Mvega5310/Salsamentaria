import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { buildIconElement } from "@/lib/storefront/icon";

const SIZE = 512;

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
