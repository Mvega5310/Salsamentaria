"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Category, Product } from "@/lib/types";
import type { ProductUnit, TaxRegime } from "@/lib/format";
import { cop } from "@/lib/format";
import {
  createCategory,
  renameCategory,
  deleteCategory,
  saveProduct,
  toggleProductActive,
  deleteProduct,
  type ProductInput,
} from "./actions";

const UNIT_OPTIONS: { id: ProductUnit; label: string }[] = [
  { id: "kg", label: "Kilogramo (kg)" },
  { id: "g", label: "Gramo (g)" },
  { id: "lb", label: "Libra (lb)" },
  { id: "und", label: "Unidad (und)" },
  { id: "l", label: "Litro (l)" },
  { id: "ml", label: "Mililitro (ml)" },
];

const TAX_OPTIONS: { id: TaxRegime; label: string; hint: string }[] = [
  { id: "gravado_19", label: "Gravado 19%", hint: "IVA general — la mayoría de embutidos y carnes procesadas" },
  { id: "gravado_5", label: "Gravado 5%", hint: "Tarifa reducida — algunos procesados específicos" },
  { id: "exento", label: "Exento", hint: "0% pero declarable — productos de la canasta básica en ciertos casos" },
  { id: "excluido", label: "Excluido", hint: "0%, no declarable — quesos frescos, lácteos, muchos cárnicos sin procesar" },
];

const EMPTY: ProductInput = {
  name: "",
  categoryId: null,
  unit: "kg",
  step: 0.25,
  price: 0,
  cost: null,
  taxRegime: "excluido",
  trackInventory: false,
  stock: 0,
  minStock: 0,
  imageUrl: null,
};

export default function CatalogoClient({
  categories,
  products,
}: {
  categories: Category[];
  products: Product[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [catFilter, setCatFilter] = useState<string>("Todas");
  const [query, setQuery] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");

  const [modal, setModal] = useState<null | { mode: "crear" | "editar"; data: ProductInput }>(null);
  const [modalError, setModalError] = useState("");

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const inCat = catFilter === "Todas" || catById.get(p.category_id ?? "") === catFilter;
      const inQ = !q || p.name.toLowerCase().includes(q);
      return inCat && inQ;
    });
  }, [products, catFilter, query, catById]);

  function refresh() {
    router.refresh();
  }

  // --- Categorías -----------------------------------------------------
  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await createCategory(name);
      if (res.ok) {
        setNewCatName("");
        refresh();
      }
    });
  }

  function saveCategoryRename(id: string) {
    const name = editingCatName.trim();
    if (!name) return setEditingCatId(null);
    startTransition(async () => {
      await renameCategory(id, name);
      setEditingCatId(null);
      refresh();
    });
  }

  function removeCategory(id: string, name: string) {
    if (!window.confirm(`¿Eliminar la categoría "${name}"? Sus productos quedarán sin categoría.`)) return;
    startTransition(async () => {
      await deleteCategory(id);
      refresh();
    });
  }

  // --- Productos --------------------------------------------------------
  function openCreate() {
    setModalError("");
    setModal({ mode: "crear", data: { ...EMPTY, categoryId: categories[0]?.id ?? null } });
  }

  function openEdit(p: Product) {
    setModalError("");
    setModal({
      mode: "editar",
      data: {
        id: p.id,
        name: p.name,
        categoryId: p.category_id,
        unit: p.unit,
        step: p.step,
        price: p.price,
        cost: p.cost ?? null,
        taxRegime: p.tax_regime,
        trackInventory: !!p.track_inventory,
        stock: p.stock ?? 0,
        minStock: p.min_stock ?? 0,
        imageUrl: p.image_url,
      },
    });
  }

  function submitModal() {
    if (!modal) return;
    startTransition(async () => {
      const res = await saveProduct(modal.data);
      if (!res.ok) {
        setModalError(res.error);
        return;
      }
      setModal(null);
      refresh();
    });
  }

  function toggleActive(p: Product) {
    startTransition(async () => {
      await toggleProductActive(p.id, !p.is_active);
      refresh();
    });
  }

  function remove(p: Product) {
    if (!window.confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      const res = await deleteProduct(p.id);
      if (!res.ok) window.alert(res.error);
      refresh();
    });
  }

  return (
    <div className="flex gap-6 p-6">
      {/* Categorías */}
      <aside className="w-[240px] flex-none rounded-xl2 border border-borde bg-crema p-4">
        <div className="mb-3 text-[13px] font-bold text-ink">Categorías</div>

        <button
          onClick={() => setCatFilter("Todas")}
          className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold ${
            catFilter === "Todas" ? "bg-ink text-crema" : "text-muted hover:bg-crema2"
          }`}
        >
          Todas ({products.length})
        </button>

        {categories.map((c) => {
          const count = products.filter((p) => p.category_id === c.id).length;
          const isEditing = editingCatId === c.id;
          return (
            <div key={c.id} className="group mb-1">
              {isEditing ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={editingCatName}
                    onChange={(e) => setEditingCatName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveCategoryRename(c.id)}
                    className="h-8 flex-1 rounded-lg border border-salsa bg-white px-2 text-[12.5px] outline-none"
                  />
                  <button
                    onClick={() => saveCategoryRename(c.id)}
                    className="h-8 w-8 rounded-lg bg-salsa text-[12px] font-bold text-crema"
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <div className="flex items-center">
                  <button
                    onClick={() => setCatFilter(c.name)}
                    className={`flex-1 rounded-lg px-3 py-2 text-left text-[13px] font-semibold ${
                      catFilter === c.name ? "bg-ink text-crema" : "text-muted hover:bg-crema2"
                    }`}
                  >
                    {c.name} ({count})
                  </button>
                  <button
                    onClick={() => {
                      setEditingCatId(c.id);
                      setEditingCatName(c.name);
                    }}
                    className="hidden h-7 w-7 flex-none rounded-lg text-[12px] text-muted hover:bg-crema2 group-hover:block"
                    title="Renombrar"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => removeCategory(c.id, c.name)}
                    className="hidden h-7 w-7 flex-none rounded-lg text-[12px] text-muted hover:bg-crema2 group-hover:block"
                    title="Eliminar"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-3 flex gap-1 border-t border-borde pt-3">
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            placeholder="Nueva categoría"
            className="h-9 flex-1 rounded-lg border border-borde bg-white px-2.5 text-[12.5px] outline-none focus:border-salsa"
          />
          <button
            onClick={addCategory}
            className="h-9 w-9 flex-none rounded-lg bg-ink text-[14px] font-bold text-crema"
          >
            +
          </button>
        </div>
      </aside>

      {/* Productos */}
      <section className="min-w-0 flex-1">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="font-display text-[22px] font-extrabold tracking-tight text-ink">
            Catálogo
          </h1>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto…"
            className="ml-auto h-11 w-[240px] rounded-xl2 border border-borde bg-white px-3.5 text-[13px] outline-none focus:border-salsa"
          />
          <button
            onClick={openCreate}
            className="h-11 rounded-xl2 bg-salsa px-5 text-[13px] font-bold text-crema hover:bg-curado"
          >
            + Nuevo producto
          </button>
        </div>

        <div className="overflow-hidden rounded-xl2 border border-borde bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-borde bg-crema2 text-left text-[11px] font-bold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">IVA</th>
                <th className="px-4 py-3">Inventario</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const tax = TAX_OPTIONS.find((t) => t.id === p.tax_regime);
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-borde last:border-0 ${
                      p.is_active === false ? "opacity-45" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold text-ink">{p.name}</td>
                    <td className="px-4 py-3 text-muted">
                      {catById.get(p.category_id ?? "") ?? "—"}
                    </td>
                    <td className="tabular px-4 py-3 font-bold text-salsa">
                      {cop(p.price)}
                      <span className="ml-1 font-medium text-muted">/{p.unit}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-crema2 px-2.5 py-1 text-[11px] font-bold text-muted">
                        {tax?.label}
                      </span>
                    </td>
                    <td className="tabular px-4 py-3 text-muted">
                      {p.track_inventory ? `${p.stock ?? 0} ${p.unit}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => toggleActive(p)}
                          className="rounded-lg border border-borde px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:bg-crema2"
                        >
                          {p.is_active === false ? "Activar" : "Pausar"}
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded-lg border border-borde px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:bg-crema2"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => remove(p)}
                          className="rounded-lg border border-borde px-2.5 py-1.5 text-[11.5px] font-semibold text-curado hover:bg-crema2"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    No hay productos que coincidan.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal de producto */}
      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(42,28,22,.45)] p-6">
          <div className="max-h-[88vh] w-full max-w-[520px] overflow-auto rounded-xl3 bg-white p-6">
            <div className="mb-5 font-display text-[19px] font-extrabold tracking-tight text-ink">
              {modal.mode === "crear" ? "Nuevo producto" : "Editar producto"}
            </div>

            <div className="flex flex-col gap-3.5">
              <Field label="Nombre">
                <input
                  value={modal.data.name}
                  onChange={(e) =>
                    setModal({ ...modal, data: { ...modal.data, name: e.target.value } })
                  }
                  className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
                />
              </Field>

              <Field label="Categoría">
                <select
                  value={modal.data.categoryId ?? ""}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      data: { ...modal.data, categoryId: e.target.value || null },
                    })
                  }
                  className="h-11 w-full rounded-xl2 border border-borde bg-white px-3.5 text-[13.5px] outline-none focus:border-salsa"
                >
                  <option value="">Sin categoría</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="flex gap-3">
                <Field label="Unidad de venta" className="flex-1">
                  <select
                    value={modal.data.unit}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        data: { ...modal.data, unit: e.target.value as ProductUnit },
                      })
                    }
                    className="h-11 w-full rounded-xl2 border border-borde bg-white px-3.5 text-[13.5px] outline-none focus:border-salsa"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Incremento (step)" className="w-[140px]">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={modal.data.step}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        data: { ...modal.data, step: Number(e.target.value) },
                      })
                    }
                    className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
                  />
                </Field>
              </div>

              <div className="flex gap-3">
                <Field label="Precio de venta (IVA incluido)" className="flex-1">
                  <input
                    type="number"
                    min="0"
                    value={modal.data.price}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        data: { ...modal.data, price: Number(e.target.value) },
                      })
                    }
                    className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
                  />
                </Field>
                <Field label="Costo (opcional)" className="flex-1">
                  <input
                    type="number"
                    min="0"
                    value={modal.data.cost ?? ""}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        data: {
                          ...modal.data,
                          cost: e.target.value === "" ? null : Number(e.target.value),
                        },
                      })
                    }
                    className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
                  />
                </Field>
              </div>

              <Field label="Régimen de IVA">
                <select
                  value={modal.data.taxRegime}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      data: { ...modal.data, taxRegime: e.target.value as TaxRegime },
                    })
                  }
                  className="h-11 w-full rounded-xl2 border border-borde bg-white px-3.5 text-[13.5px] outline-none focus:border-salsa"
                >
                  {TAX_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                  {TAX_OPTIONS.find((t) => t.id === modal.data.taxRegime)?.hint} — valida con tu contador antes de facturar.
                </p>
              </Field>

              <label className="flex items-center gap-2.5 text-[13px] font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={modal.data.trackInventory}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      data: { ...modal.data, trackInventory: e.target.checked },
                    })
                  }
                  className="h-4 w-4 accent-salsa"
                />
                Controlar inventario de este producto
              </label>

              {modal.data.trackInventory ? (
                <div className="flex gap-3">
                  <Field label="Existencias actuales" className="flex-1">
                    <input
                      type="number"
                      min="0"
                      value={modal.data.stock}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          data: { ...modal.data, stock: Number(e.target.value) },
                        })
                      }
                      className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
                    />
                  </Field>
                  <Field label="Alerta de mínimo" className="flex-1">
                    <input
                      type="number"
                      min="0"
                      value={modal.data.minStock}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          data: { ...modal.data, minStock: Number(e.target.value) },
                        })
                      }
                      className="h-11 w-full rounded-xl2 border border-borde px-3.5 text-[13.5px] outline-none focus:border-salsa"
                    />
                  </Field>
                </div>
              ) : null}

              {modalError ? (
                <div className="rounded-xl2 bg-[#F6DED6] px-4 py-3 text-[12.5px] font-semibold text-curado">
                  {modalError}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex gap-2.5">
              <button
                onClick={() => setModal(null)}
                className="h-[50px] flex-1 rounded-xl2 border border-borde text-[13.5px] font-bold text-muted hover:bg-crema2"
              >
                Cancelar
              </button>
              <button
                disabled={pending}
                onClick={submitModal}
                className="h-[50px] flex-1 rounded-xl2 bg-salsa text-[13.5px] font-bold text-crema hover:bg-curado disabled:opacity-60"
              >
                {pending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
