import { createClient } from "@/lib/supabase/server";
import type { BoardOrder } from "@/lib/types";
import BoardClient from "./board-client";

export const dynamic = "force-dynamic";

type Row = Omit<BoardOrder, "item_count"> & {
  order_items: { count: number }[] | null;
};

export default async function TableroPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      "id, code, status, channel, fulfillment, total, needs_invoice, contact_name, delivery_address, created_at, order_items(count)",
    )
    .not("status", "in", "(entregado,cancelado)")
    .order("created_at", { ascending: false });

  const orders: BoardOrder[] = ((data ?? []) as Row[]).map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    channel: o.channel,
    fulfillment: o.fulfillment,
    total: o.total,
    needs_invoice: o.needs_invoice,
    contact_name: o.contact_name,
    delivery_address: o.delivery_address,
    created_at: o.created_at,
    item_count: o.order_items?.[0]?.count ?? 0,
  }));

  return <BoardClient orders={orders} />;
}
