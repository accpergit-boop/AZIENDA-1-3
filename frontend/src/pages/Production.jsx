import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Card, Btn, Input, Select, Textarea, Badge, Modal, PageHeader, Empty } from "@/components/common";
import { Factory, Plus } from "lucide-react";

const STATUSES = ["Planned", "In Production", "Resting", "Ready for Cutting", "Cutting", "Consumed", "Cancelled"];
const META = {
  Planned: "bg-slate-100 text-slate-600 border-slate-200",
  "In Production": "bg-blue-50 text-blue-700 border-blue-200",
  Resting: "bg-amber-50 text-amber-700 border-amber-200",
  "Ready for Cutting": "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cutting: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Consumed: "bg-slate-100 text-slate-500 border-slate-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
};
const blank = () => ({ block_ref: "", production_date: new Date().toISOString().slice(0, 10), status: "Planned", resting_start: "", resting_end: "", planned_cutting: "", confirmed_qty: 0, stock_id: "", notes: "" });

export default function Production() {
  const [list, setList] = useState([]);
  const [stock, setStock] = useState([]);
  const [modal, setModal] = useState(null);
  const [sp, setSp] = useSearchParams();

  const load = () => { api.get("/production").then(setList); api.get("/stock").then(setStock); };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (sp.get("add")) { setModal(blank()); setSp({}); } }, [sp]);

  const save = async () => {
    if (!modal.block_ref.trim()) return toast.error("Block reference required");
    try {
      const payload = { ...modal, confirmed_qty: Number(modal.confirmed_qty) || 0 };
      if (modal.id) await api.put(`/production/${modal.id}`, payload);
      else await api.post("/production", payload);
      toast.success("Production record saved"); setModal(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader title="Foam Production" subtitle="Foam blocks are managed separately from finished stock">
        <Btn onClick={() => setModal(blank())} data-testid="add-production-btn"><Plus size={16} /> New Block</Btn>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[["Resting", "Resting"], ["Ready for Cutting", "Ready"], ["In Production", "In Production"]].map(([s, lbl]) => (
          <Card key={s} className="p-4"><p className="text-xs text-slate-400 uppercase font-semibold">{lbl}</p><p className="text-2xl font-bold text-slate-800 mt-1">{list.filter((p) => p.status === s).length}</p></Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {list.length === 0 ? <Empty icon={Factory} title="No production records" hint="Add a foam block to start tracking." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-border">
                <th className="px-4 py-3 font-semibold">Block Ref</th><th className="px-4 font-semibold">Prod. Date</th><th className="px-4 font-semibold">Status</th><th className="px-4 font-semibold">Planned Cut</th><th className="px-4 font-semibold text-right">Confirmed Qty</th><th className="px-4 font-semibold text-right">Action</th>
              </tr></thead>
              <tbody>{list.map((p) => (
                <tr key={p.id} className="border-b border-border/60 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold font-mono text-slate-800">{p.block_ref}</td>
                  <td className="px-4 text-slate-500">{fmtDate(p.production_date)}</td>
                  <td className="px-4"><Badge cls={META[p.status]}>{p.status}</Badge></td>
                  <td className="px-4 text-slate-500">{p.planned_cutting ? fmtDate(p.planned_cutting) : "-"}</td>
                  <td className="px-4 text-right font-mono">{p.confirmed_qty || 0}</td>
                  <td className="px-4 text-right"><button onClick={() => setModal({ ...p })} className="text-primary hover:underline text-xs font-semibold" data-testid={`edit-production-${p.id}`}>Update</button></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? "Update Block" : "New Foam Block"}>
        {modal && <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Block Reference *" value={modal.block_ref} onChange={(e) => setModal({ ...modal, block_ref: e.target.value })} data-testid="block-ref-input" />
            <Input label="Production Date" type="date" value={modal.production_date} onChange={(e) => setModal({ ...modal, production_date: e.target.value })} />
          </div>
          <Select label="Status" value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value })} data-testid="production-status-select">
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Resting Start" type="datetime-local" value={modal.resting_start || ""} onChange={(e) => setModal({ ...modal, resting_start: e.target.value })} />
            <Input label="Resting End" type="datetime-local" value={modal.resting_end || ""} onChange={(e) => setModal({ ...modal, resting_end: e.target.value })} />
          </div>
          <Input label="Planned Cutting Date" type="date" value={modal.planned_cutting || ""} onChange={(e) => setModal({ ...modal, planned_cutting: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Confirmed Qty" type="number" value={modal.confirmed_qty} onChange={(e) => setModal({ ...modal, confirmed_qty: e.target.value })} />
            <Select label="Add to Stock (on Consumed)" value={modal.stock_id || ""} onChange={(e) => setModal({ ...modal, stock_id: e.target.value })}>
              <option value="">None</option>
              {stock.map((s) => <option key={s.id} value={s.id}>{s.product} {s.size}</option>)}
            </Select>
          </div>
          <p className="text-xs text-slate-400">Set status to "Consumed" with a confirmed qty and stock item to add finished production into stock (once).</p>
          <Textarea label="Notes" rows={2} value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} />
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn><Btn onClick={save} data-testid="save-production-btn">Save</Btn></div>
        </div>}
      </Modal>
    </div>
  );
}
