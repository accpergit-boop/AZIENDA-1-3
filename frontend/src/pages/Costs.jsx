import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtMoney, today } from "@/lib/format";
import { Btn, Card, Empty, Input, Modal, PageHeader, Textarea } from "@/components/common";

const firstDayOfMonth = () => `${today().slice(0, 7)}-01`;
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const blankRecord = () => ({
  product: "",
  production_date: today(),
  quantity_produced: "1",
  quantity_unit: "block",
  selling_price_per_unit: "",
  cost_items: [{ description: "", quantity: "1", unit: "L", unit_cost: "" }],
  notes: "",
});

function getCalculations(record) {
  const totalCost = record.cost_items.reduce((sum, item) =>
    sum + roundMoney((Number(item.quantity) || 0) * (Number(item.unit_cost) || 0)), 0);
  const produced = Number(record.quantity_produced) || 0;
  const costPerUnit = produced > 0 ? totalCost / produced : 0;
  const sellingPrice = Number(record.selling_price_per_unit) || 0;
  return {
    totalCost,
    costPerUnit,
    profitPerUnit: sellingPrice - costPerUnit,
    totalProfit: sellingPrice * produced - totalCost,
  };
}

export default function Costs() {
  const [since, setSince] = useState(firstDayOfMonth);
  const [until, setUntil] = useState(today);
  const [records, setRecords] = useState(null);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setRecords(await api.get("/cost-records"));
    } catch (error) {
      toast.error(apiError(error));
      setRecords([]);
    }
  };

  useEffect(() => { load(); }, []);

  const visibleRecords = useMemo(() => (records || []).filter((record) =>
    (!since || record.production_date >= since) && (!until || record.production_date <= until),
  ), [records, since, until]);

  const formCalculations = modal ? getCalculations(modal) : null;

  const save = async () => {
    if (!modal.product.trim()) return toast.error("Product name is required");
    if (!(Number(modal.quantity_produced) > 0)) return toast.error("Quantity produced must be greater than 0");
    if (!(Number(modal.selling_price_per_unit) > 0)) return toast.error("Selling price must be greater than 0");
    if (!modal.cost_items.length || modal.cost_items.some((item) =>
      !item.description.trim() || !item.unit.trim()
      || !(Number(item.quantity) > 0) || !(Number(item.unit_cost) > 0)
    )) return toast.error("Complete each material with quantity and unit cost greater than 0");
    if (busy) return;

    setBusy(true);
    try {
      const record = await api.post("/cost-records", {
        ...modal,
        product: modal.product.trim(),
        quantity_produced: Number(modal.quantity_produced),
        quantity_unit: modal.quantity_unit.trim() || "unit",
        selling_price_per_unit: Number(modal.selling_price_per_unit),
        cost_items: modal.cost_items.map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unit: item.unit.trim(),
          unit_cost: Number(item.unit_cost),
        })),
        notes: modal.notes.trim(),
      });
      setRecords((current) => [record, ...(current || [])]
        .sort((a, b) => b.production_date.localeCompare(a.production_date)));
      setModal(null);
      toast.success("Production cost saved");
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (record) => {
    if (!window.confirm(`Permanently delete production cost for ${record.product} on ${fmtDate(record.production_date)}? This cannot be undone.`)) return;
    if (busy) return;

    setBusy(true);
    try {
      await api.del(`/cost-records/${record.id}`);
      setRecords((current) => (current || []).filter((item) => item.id !== record.id));
      toast.success("Production cost deleted");
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Costs" subtitle="Production cost, selling price and gross profit">
        <Btn onClick={() => setModal(blankRecord())} data-testid="add-cost-btn">
          <Plus size={16} /> Add Cost
        </Btn>
      </PageHeader>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Input label="From production date" type="date" value={since}
          onChange={(event) => setSince(event.target.value)} data-testid="costs-since" />
        <Input label="To production date" type="date" value={until}
          onChange={(event) => setUntil(event.target.value)} data-testid="costs-until" />
        <p className="pb-2 text-sm text-slate-500">Company data follows the company selected in the ERP.</p>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold text-slate-800">Production costs and profit</h2>
          <p className="mt-1 text-xs text-slate-500">Profit is calculated per unit and for the batch if all produced units are sold.</p>
        </div>
        {records === null ? <p className="p-6 text-sm text-slate-400" role="status">Loading production costs...</p>
          : !visibleRecords.length ? <Empty icon={Banknote} title="No production costs for this period" hint="Add a product and record its chemicals or other production inputs." />
            : <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead><tr className="border-b border-border bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Date / product</th>
                  <th className="px-4 py-3">Production inputs</th>
                  <th className="px-4 py-3 text-right">Quantity made</th>
                  <th className="px-4 py-3 text-right">Total production cost</th>
                  <th className="px-4 py-3 text-right">Cost per unit</th>
                  <th className="px-4 py-3 text-right">Selling price / unit</th>
                  <th className="px-4 py-3 text-right">Profit / unit</th>
                  <th className="px-4 py-3 text-right">Batch profit*</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr></thead>
                <tbody>{visibleRecords.map((record) => (
                  <tr key={record.id} className="border-b border-border/60 align-top">
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap text-slate-500">{fmtDate(record.production_date)}</span>
                      <p className="mt-1 font-semibold text-slate-800">{record.product}</p>
                      {record.notes && <p className="mt-1 max-w-xs text-xs text-slate-500">{record.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {record.cost_items.map((item, index) => (
                        <p key={`${item.description}-${index}`} className="whitespace-nowrap text-slate-600">
                          {item.description}: {item.quantity} {item.unit} × {fmtMoney(item.unit_cost)} = {fmtMoney(item.total_cost)}
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{record.quantity_produced} {record.quantity_unit}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{fmtMoney(record.total_production_cost)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMoney(record.cost_per_unit)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMoney(record.selling_price_per_unit)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${record.profit_per_unit < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {fmtMoney(record.profit_per_unit)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${record.total_profit_if_all_sold < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {fmtMoney(record.total_profit_if_all_sold)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => remove(record)} disabled={busy}
                        title="Permanently delete production cost"
                        aria-label={`Delete production cost for ${record.product}`}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        data-testid={`delete-cost-${record.id}`}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              <p className="px-4 py-3 text-xs text-slate-500">*Batch profit assumes every produced unit is sold at the entered selling price. It is gross profit, not net company profit.</p>
            </div>}
      </Card>

      <Modal open={!!modal} onClose={() => !busy && setModal(null)} title="Add Production Cost" wide>
        {modal && <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Product / foam block *" value={modal.product}
              onChange={(event) => setModal({ ...modal, product: event.target.value })}
              placeholder="e.g. Foam Block" data-testid="cost-product-input" />
            <Input label="Production date" type="date" value={modal.production_date}
              onChange={(event) => setModal({ ...modal, production_date: event.target.value })}
              data-testid="cost-date-input" />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Quantity produced *" type="number" min="0.001" step="0.001"
                value={modal.quantity_produced}
                onChange={(event) => setModal({ ...modal, quantity_produced: event.target.value })}
                data-testid="cost-quantity-input" />
              <Input label="Unit" value={modal.quantity_unit}
                onChange={(event) => setModal({ ...modal, quantity_unit: event.target.value })}
                placeholder="block, kg..." />
            </div>
            <Input label="Selling price per unit (ZAR) *" type="number" min="0.01" step="0.01"
              value={modal.selling_price_per_unit}
              onChange={(event) => setModal({ ...modal, selling_price_per_unit: event.target.value })}
              data-testid="cost-selling-price-input" />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Chemicals and production inputs</h3>
                <p className="text-xs text-slate-500">Enter amount used and cost per unit; each line total is calculated.</p>
              </div>
              <Btn variant="outline" onClick={() => setModal({
                ...modal,
                cost_items: [...modal.cost_items, { description: "", quantity: "1", unit: "L", unit_cost: "" }],
              })} data-testid="add-production-input-btn"><Plus size={15} /> Add input</Btn>
            </div>
            {modal.cost_items.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1.4fr_0.7fr_0.65fr_0.8fr_auto] sm:items-end">
                <Input label={`Chemical / input ${index + 1} *`} value={item.description}
                  onChange={(event) => setModal({
                    ...modal,
                    cost_items: modal.cost_items.map((row, i) => i === index ? { ...row, description: event.target.value } : row),
                  })} placeholder="e.g. Polyol" data-testid={`cost-input-description-${index}`} />
                <Input label="Amount used *" type="number" min="0.001" step="0.001" value={item.quantity}
                  onChange={(event) => setModal({
                    ...modal,
                    cost_items: modal.cost_items.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row),
                  })} data-testid={`cost-input-quantity-${index}`} />
                <Input label="Unit *" value={item.unit}
                  onChange={(event) => setModal({
                    ...modal,
                    cost_items: modal.cost_items.map((row, i) => i === index ? { ...row, unit: event.target.value } : row),
                  })} placeholder="L, kg" />
                <Input label="Cost / unit (ZAR) *" type="number" min="0.01" step="0.01" value={item.unit_cost}
                  onChange={(event) => setModal({
                    ...modal,
                    cost_items: modal.cost_items.map((row, i) => i === index ? { ...row, unit_cost: event.target.value } : row),
                  })} data-testid={`cost-input-unit-cost-${index}`} />
                {modal.cost_items.length > 1 && <button type="button"
                  onClick={() => setModal({ ...modal, cost_items: modal.cost_items.filter((_, i) => i !== index) })}
                  aria-label={`Remove production input ${index + 1}`} className="mb-2 rounded p-2 text-slate-400 hover:text-red-600">
                  <Trash2 size={16} />
                </button>}
              </div>
            ))}
          </div>

          <div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-3" aria-live="polite" data-testid="cost-live-calculations">
            <div><p className="text-xs text-slate-500">Total production cost</p><p className="font-mono text-lg font-bold">{fmtMoney(formCalculations.totalCost)}</p></div>
            <div><p className="text-xs text-slate-500">Cost per unit</p><p className="font-mono text-lg font-bold">{fmtMoney(formCalculations.costPerUnit)}</p></div>
            <div><p className="text-xs text-slate-500">Profit per unit</p><p className={`font-mono text-lg font-bold ${formCalculations.profitPerUnit < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmtMoney(formCalculations.profitPerUnit)}</p></div>
          </div>
          <Textarea label="Notes (optional)" rows={2} value={modal.notes}
            onChange={(event) => setModal({ ...modal, notes: event.target.value })} data-testid="cost-notes-input" />
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setModal(null)} disabled={busy}>Cancel</Btn>
            <Btn onClick={save} disabled={busy} data-testid="save-cost-btn">{busy ? "Saving..." : "Save Production Cost"}</Btn>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
