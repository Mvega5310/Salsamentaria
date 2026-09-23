"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, isAdminRole } from "@/lib/tenant";
import type { ProductUnit, TaxRegime } from "@/lib/format";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const ctx = await getTenantContext();
  if (!ctx) return { ctx: null, error: "Sin negocio activo." } as const;
  if (!isAdminRole(ctx.role)) {
    return { ctx: null, error: "Solo el propietario o un administrador puede editar el catálogo." } as const;
  }
  return { ctx, error: null } as const;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------
export async function createCategory(name: string): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };
  if (!name.trim()) return { ok: false, error: "Escribe un nombre." };

  const supabase = createClient();
  const { data: max } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("tenant_id", ctx.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: dbError } = await supabase.from("categories").insert({
    tenant_id: ctx.tenantId,
    name: name.trim(),
    sort_order: (max?.sort_order ?? 0) + 1,
  });

  if (dbError) return { ok: false, error: "Ya existe una categoría con ese nombre." };
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function renameCategory(id: string, name: string): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };
  if (!name.trim()) return { ok: false, error: "Escribe un nombre." };

  const supabase = createClient();
  const { error: dbError } = await supabase
    .from("categories")
    .update({ name: name.trim() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (dbError) return { ok: false, error: "No se pudo renombrar la categoría." };
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const supabase = createClient();
  // Los productos de esta categoría quedan sin categoría (ON DELETE SET NULL).
  const { error: dbError } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (dbError) return { ok: false, error: "No se pudo eliminar la categoría." };
  revalidatePath("/catalogo");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------
export type ProductInput = {
  id?: string; // presente = edición
  name: string;
  categoryId: string | null;
  unit: ProductUnit;
  step: number;
  price: number;
  cost: number | null;
  taxRegime: TaxRegime;
  trackInventory: boolean;
  stock: number;
  minStock: number;
  imageUrl: string | null;
};

export async function saveProduct(input: ProductInput): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  if (!input.name.trim()) return { ok: false, error: "Escribe un nombre de producto." };
  if (input.price <= 0) return { ok: false, error: "El precio debe ser mayor a cero." };
  if (input.step <= 0) return { ok: false, error: "El incremento de venta debe ser mayor a cero." };

  const supabase = createClient();
  const payload = {
    tenant_id: ctx.tenantId,
    name: input.name.trim(),
    slug: slugify(input.name),
    category_id: input.categoryId,
    unit: input.unit,
    step: input.step,
    price: input.price,
    cost: input.cost,
    tax_regime: input.taxRegime,
    track_inventory: input.trackInventory,
    stock: input.stock,
    min_stock: input.minStock,
    image_url: input.imageUrl,
  };

  const { error: dbError } = input.id
    ? await supabase.from("products").update(payload).eq("id", input.id).eq("tenant_id", ctx.tenantId)
    : await supabase.from("products").insert(payload);

  if (dbError) {
    return {
      ok: false,
      error: dbError.message.includes("unique")
        ? "Ya existe un producto con un nombre muy similar."
        : "No se pudo guardar el producto.",
    };
  }

  revalidatePath("/catalogo");
  revalidatePath("/pos");
  return { ok: true };
}

export async function toggleProductActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const supabase = createClient();
  const { error: dbError } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (dbError) return { ok: false, error: "No se pudo actualizar el producto." };
  revalidatePath("/catalogo");
  revalidatePath("/pos");
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const supabase = createClient();
  const { error: dbError } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (dbError) {
    // Con ventas asociadas, la FK de order_items (ON DELETE SET NULL) no
    // debería impedirlo, pero cubrimos el caso igual con un mensaje claro.
    return { ok: false, error: "No se pudo eliminar. Si ya tiene ventas registradas, desactívalo en vez de borrarlo." };
  }
  revalidatePath("/catalogo");
  revalidatePath("/pos");
  return { ok: true };
}
