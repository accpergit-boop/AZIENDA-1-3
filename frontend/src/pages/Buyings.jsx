import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtMoney, today } from "@/lib/format";
import { Btn, Card, Empty, Input, Modal, PageHeader, Textarea } from "@/components/common";

const blankBuying = () => ({
  product: "",
  source: "",
  quantity: "1",
  unit_price: "",
  date: today(),
  notes: "",
});

export default function Buyings() {
  const [buyings, setBuyings] = useState(null);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/buyings")
    .then(setBuyings)
    .catch((error) => {
      toast.error(apiError(error));
      setBuyings([]);
    });

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => (buyings || []).filter((buying) =>
    `${buying.product} ${buying.source} ${buying.notes || ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [buyings, query]);
  const total = filtered.reduce((sum, buying) => sum + Number(buying.amount || 0), 0);
  const formTotal = (Number(modal?.quantity) || 0) * (Number(modal?.unit_price) || 0);
  const quantityUnit = (product) => product?.trim().toLowerCase() === "chemical" ? "L" : "";

  const save = async () => {
    if (!modal.product.trim()) return toast.error("Product is required");
    if (!modal.source.trim()) return toast.error("Source is required");
    if (!(Number(modal.quantity) > 0)) return toast.error("Quantity must be greater than 0");
    if (!(Number(modal.unit_price) > 0)) return toast.error("Unit price must be greater than 0");
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        ...modal,
        quantity: Number(modal.quantity),
        unit_price: Number(modal.unit_price),
      };
      if (modal.id) await api.put(`/buyings/${modal.id}`, payload);
      else await api.post("/buyings", payload);
      toast.success("Buying saved");
      setModal(null);
      await load();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const voidBuying = async (buying) => {
    const reason = window.prompt(`Void purchase "${buying.product}" (${fmtMoney(buying.amount)})? Reason:`);
    if (reason === null) return;
    if (!reason.trim()) return toast.error("A reason is required");
    try {
      await api.post(`/buyings/${buying.id}/void`, { reason });
      toast.success("Buying voided");
      await load();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  return (
    <div>
      <PageHeader title="Buyings" subtitle="Record items purchased and their costs">
        <Btn onClick={() => setModal(blankBuying())} data-testid="add-buying-btn"><Plus size={16} /> Add Buying</Btn>
      </PageHeader>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search product, source or notes..."
            aria-label="Search buyings"
            data-testid="buyings-search"
            className="w-full rounded-lg border border-input pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <p className="text-sm text-slate-500">Filtered total: <span className="font-mono font-bold text-slate-800">{fmtMoney(total)}</span></p>
      </Card>

      <Card className="overflow-hidden">
        {buyings === null ? <p className="p-6 text-sm text-slate-400" role="status">Loading purchases...</p> : filtered.length === 0 ? (
          <Empty icon={ShoppingCart} title="No purchases recorded" hint="Add your first buying to keep track of purchased items." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50 text-left text-xs text-slate-400">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Bought from</th>
                  <th className="px-4 py-3 text-right font-semibold">Quantity</th>
                  <th className="px-4 py-3 text-right font-semibold">Unit price</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((buying) => (
                  <tr key={buying.id} className="border-b border-border/60 hover:bg-slate-50" data-testid={`buying-row-${buying.id}`}>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(buying.date)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {buying.product}
                      {buying.notes && <p className="mt-0.5 max-w-56 truncate text-xs font-normal text-slate-400">{buying.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{buying.source}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {buying.quantity}{(buying.quantity_unit || quantityUnit(buying.product)) && ` ${buying.quantity_unit || quantityUnit(buying.product)}`}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMoney(buying.unit_price)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{fmtMoney(buying.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setModal({ ...buying, quantity: String(buying.quantity), unit_price: String(buying.unit_price) })}
                        aria-label={`Edit ${buying.product}`}
                        data-testid={`edit-buying-${buying.id}`}
                        className="rounded p-1.5 text-slate-400 hover:text-primary"
                      ><Pencil size={15} /></button>
                      <button
                        type="button"
                        onClick={() => voidBuying(buying)}
                        aria-label={`Void ${buying.product}`}
                        data-testid={`void-buying-${buying.id}`}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      ><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => !saving && setModal(null)} title={modal?.id ? "Edit Buying" : "Add Buying"}>
        {modal && (
          <div className="space-y-4">
            <Input
              label="Product / item"
              value={modal.product}
              onChange={(event) => setModal({ ...modal, product: event.target.value })}
              placeholder="Type the item name"
              data-testid="buying-product"
              required
            />
            <Input
              label="Bought from"
              value={modal.source}
              onChange={(event) => setModal({ ...modal, source: event.target.value })}
              placeholder="Supplier or place"
              data-testid="buying-source"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={quantityUnit(modal.product) ? "Quantity (L)" : "Quantity"}
                type="number"
                min="0.01"
                step="0.01"
                value={modal.quantity}
                onChange={(event) => setModal({ ...modal, quantity: event.target.value })}
                data-testid="buying-quantity"
                required
              />
              <Input
                label="Unit price (R)"
                type="number"
                min="0.01"
                step="0.01"
                value={modal.unit_price}
                onChange={(event) => setModal({ ...modal, unit_price: event.target.value })}
                data-testid="buying-unit-price"
                required
              />
            </div>
            <p className="text-right text-sm text-slate-500">Total: <span className="font-mono font-bold text-slate-800">{fmtMoney(formTotal)}</span></p>
            <Input label="Purchase date" type="date" value={modal.date} onChange={(event) => setModal({ ...modal, date: event.target.value })} />
            <Textarea label="Notes (optional)" rows={2} value={modal.notes || ""} onChange={(event) => setModal({ ...modal, notes: event.target.value })} />
            <div className="flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Btn>
              <Btn onClick={save} disabled={saving} data-testid="save-buying-btn">{saving ? "Saving..." : "Save Buying"}</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
