"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/types";

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  recibido: "confirmado",
  confirmado: "preparando",
  preparando: "en_camino",
  en_camino: "entregado",
};

export async function advanceOrder(
  orderId: string,
  current: OrderStatus,
): Promise<{ ok: boolean }> {
  const next = NEXT[current];
  if (!next) return { ok: false };

  const supabase = createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status: next })
    .eq("id", orderId);

  revalidatePath("/tablero");
  return { ok: !error };
}
