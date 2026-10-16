import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Card, Btn, Input, Select, Badge, Modal, PageHeader, Empty } from "@/components/common";
import { Boxes, Plus, ArrowUpDown, History } from "lucide-react";

const MOVE_TYPES = [
  { v: "production", l: "Production Received (+)" },
  { v: "adjustment_in", l: "Adjustment In (+)" },
  { v: "return", l: "Return (+)" },
  { v: "dispatch", l: "Dispatch (-)" },
  { v: "adjustment_out", l: "Adjustment Out (-)" },
];

export default function Stock() {
  const [list, setList] = useState([]);
  const [movements, setMovements] = useState([]);
  const [addModal, setAddModal] = useState(null);
  const [moveModal, setMoveModal] = useState(null);
  const [showHist, setShowHist] = useState(false);

  const load = () => { api.get("/stock").then(setList); api.get("/stock/movements").then(setMovements); };
  useEffect(() => { load(); }, []);

  const saveStock = async () => {
    if (!addModal.product.trim()) return toast.error("Product name required");
    try { await api.post("/stock", addModal); toast.success("Stock item added"); setAddModal(null); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const saveMove = async () => {
    if (!(Number(moveModal.quantity) > 0)) return toast.error("Quantity must be positive");
    try { await api.post(`/stock/${moveModal.stock_id}/movements`, moveModal); toast.success("Movement recorded"); setMoveModal(null); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader title="Finished Stock" subtitle="Finished mattress stock levels">
        <Btn variant="outline" onClick={() => setShowHist(true)} data-testid="stock-history-btn"><History size={16} /> History</Btn>
        <Btn onClick={() => setAddModal({ product: "", size: "", opening: 0, threshold: 5 })} data-testid="add-stock-btn"><Plus size={16} /> Add Product</Btn>
      </PageHeader>

      <Card className="overflow-hidden">
        {list.length === 0 ? <Empty icon={Boxes} title="No stock records" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead><tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-border">
                <th className="px-4 py-3 font-semibold">Product</th><th className="px-4 font-semibold">Size</th><th className="px-4 font-semibold text-right">Opening</th><th className="px-4 font-semibold text-right">Production</th><th className="px-4 font-semibold text-right">Dispatched</th><th className="px-4 font-semibold text-right">Adjust.</th><th className="px-4 font-semibold text-right">Current</th><th className="px-4 font-semibold">Last Move</th><th className="px-4 font-semibold text-right">Action</th>
              </tr></thead>
              <tbody>{list.map((s) => (
                <tr key={s.id} className="border-b border-border/60 hover:bg-slate-50" data-testid={`stock-row-${s.id}`}>
                  <td className="px-4 py-3 font-semibold text-slate-800">{s.product}</td>
                  <td className="px-4 text-slate-500 font-mono">{s.size}</td>
                  <td className="px-4 text-right font-mono text-slate-500">{s.opening}</td>
                  <td className="px-4 text-right font-mono text-emerald-600">+{s.production_received || 0}</td>
                  <td className="px-4 text-right font-mono text-red-500">-{s.dispatched || 0}</td>
                  <td className="px-4 text-right font-mono text-slate-500">{s.adjustments || 0}</td>
                  <td className="px-4 text-right"><span className={`font-mono font-bold ${s.current <= s.threshold ? "text-red-600" : "text-slate-800"}`}>{s.current}</span>{s.current <= s.threshold && <Badge cls="bg-red-50 text-red-700 border-red-200 ml-2">Low</Badge>}</td>
                  <td className="px-4 text-slate-400 text-xs">{s.last_movement ? fmtDate(s.last_movement) : "-"}</td>
                  <td className="px-4 text-right"><button onClick={() => setMoveModal({ stock_id: s.id, type: "production", quantity: 1, reason: "", reference: "" })} className="text-primary hover:underline text-xs font-semibold flex items-center gap-1 ml-auto" data-testid={`move-stock-${s.id}`}><ArrowUpDown size={13} /> Move</button></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!addModal} onClose={() => setAddModal(null)} title="Add Stock Product">
        {addModal && <div className="space-y-4">
          <Input label="Product *" value={addModal.product} onChange={(e) => setAddModal({ ...addModal, product: e.target.value })} data-testid="stock-product-input" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Size" value={addModal.size} onChange={(e) => setAddModal({ ...addModal, size: e.target.value })} placeholder="910x100" />
            <Input label="Opening Qty" type="number" value={addModal.opening} onChange={(e) => setAddModal({ ...addModal, opening: Number(e.target.value) })} />
          </div>
          <Input label="Low-Stock Threshold" type="number" value={addModal.threshold} onChange={(e) => setAddModal({ ...addModal, threshold: Number(e.target.value) })} />
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setAddModal(null)}>Cancel</Btn><Btn onClick={saveStock} data-testid="save-stock-btn">Add</Btn></div>
        </div>}
      </Modal>

      <Modal open={!!moveModal} onClose={() => setMoveModal(null)} title="Record Stock Movement">
        {moveModal && <div className="space-y-4">
          <Select label="Movement Type" value={moveModal.type} onChange={(e) => setMoveModal({ ...moveModal, type: e.target.value })} data-testid="move-type-select">
            {MOVE_TYPES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </Select>
          <Input label="Quantity" type="number" value={moveModal.quantity} onChange={(e) => setMoveModal({ ...moveModal, quantity: Number(e.target.value) })} data-testid="move-qty-input" />
          <Input label="Reason" value={moveModal.reason} onChange={(e) => setMoveModal({ ...moveModal, reason: e.target.value })} />
          <Input label="Reference (optional)" value={moveModal.reference} onChange={(e) => setMoveModal({ ...moveModal, reference: e.target.value })} />
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setMoveModal(null)}>Cancel</Btn><Btn onClick={saveMove} data-testid="save-move-btn">Record</Btn></div>
        </div>}
      </Modal>

      <Modal open={showHist} onClose={() => setShowHist(false)} title="Stock Movement History" wide>
        {movements.length === 0 ? <p className="text-sm text-slate-400">No movements yet.</p> : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">{movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
              <span className="font-semibold text-slate-700">{m.product} {m.size}</span>
              <span className="text-slate-400 text-xs">{m.reason || m.type}</span>
              <span className={`font-mono font-semibold ${["production", "adjustment_in", "return"].includes(m.type) ? "text-emerald-600" : "text-red-600"}`}>{["production", "adjustment_in", "return"].includes(m.type) ? "+" : "-"}{m.quantity}</span>
              <span className="text-slate-400 text-xs">{fmtDate(m.created_at)}</span>
            </div>))}</div>
        )}
      </Modal>
    </div>
  );
}
