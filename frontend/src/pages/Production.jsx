import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtDateTime, nowLocalInput, today } from "@/lib/format";
import { Card, Btn, Input, Select, Textarea, Badge, Modal, PageHeader, Empty } from "@/components/common";
import { Factory, Plus, CloudRain, Snowflake, PackageCheck } from "lucide-react";

const STATUSES = ["Planned", "In Production", "Resting", "Ready for Cutting", "Completed", "Cancelled"];
const META = {
  Planned: "bg-slate-100 text-slate-600 border-slate-200", "In Production": "bg-blue-50 text-blue-700 border-blue-200",
  Resting: "bg-amber-50 text-amber-700 border-amber-200", "Ready for Cutting": "bg-emerald-50 text-emerald-700 border-emerald-200",
  Completed: "bg-slate-100 text-slate-500 border-slate-200", Cancelled: "bg-red-50 text-red-700 border-red-200",
};
const W_META = { Suitable: "bg-emerald-50 text-emerald-700 border-emerald-200", Caution: "bg-amber-50 text-amber-700 border-amber-200", Unsuitable: "bg-red-50 text-red-700 border-red-200" };
const blank = () => ({ block_ref: "", product: "", size: "", quantity: 1, production_date: today(), production_time: nowLocalInput(), team: "", weather: "", rain_risk: false, cold_risk: false, override_reason: "", status: "Planned", planned_cutting: "", notes: "" });

export default function Production() {
  const [list, setList] = useState(null);
  const [stock, setStock] = useState([]);
  const [modal, setModal] = useState(null);
  const [recv, setRecv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sp, setSp] = useSearchParams();

  const load = () => { api.get("/production").then(setList).catch((e) => { toast.error(apiError(e)); setList([]); }); api.get("/stock").then(setStock); };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (sp.get("add")) { setModal(blank()); setSp({}); } }, [sp]);

  const save = async () => {
    if (!modal.block_ref.trim()) return toast.error("Block reference required");
    if (busy) return; setBusy(true);
    try {
      const payload = { ...modal, quantity: Number(modal.quantity) || 0, production_date: (modal.production_time || "").slice(0, 10) || modal.production_date };
      delete payload.ready_at; delete payload.rest_elapsed;
      if (modal.id) await api.put(`/production/${modal.id}`, payload);
      else await api.post("/production", payload);
      toast.success("Production record saved"); setModal(null); load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const receive = async () => {
    if (!recv.stock_id) return toast.error("Select the finished stock product");
    if (!(Number(recv.quantity) > 0)) return toast.error("Quantity must be positive");
    if (busy) return; setBusy(true);
    try { await api.post(`/production/${recv.id}/receive`, { stock_id: recv.stock_id, quantity: Number(recv.quantity) }); toast.success("Received into stock (once)"); setRecv(null); load(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const risky = modal && (modal.weather === "Unsuitable" || modal.rain_risk);
  const items = list || [];
  const count = (fn) => items.filter(fn).length;

  return (
    <div>
      <PageHeader title="Foam Production" subtitle="Foam blocks, resting time and weather risk">
        <Btn onClick={() => setModal(blank())} data-testid="add-production-btn"><Plus size={16} /> New Block</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[["In Production", (p) => p.status === "In Production"], ["Resting", (p) => p.status === "Resting" && !p.rest_elapsed],
          ["Ready for Cutting", (p) => p.status === "Ready for Cutting" || (p.status === "Resting" && p.rest_elapsed)], ["Completed", (p) => p.status === "Completed"]].map(([l, fn]) => (
          <Card key={l} className="p-4" data-testid={`prod-kpi-${l.toLowerCase().replace(/\s/g, "-")}`}><p className="text-xs text-slate-400 uppercase font-semibold">{l}</p><p className="text-2xl font-bold text-slate-800 mt-1 font-mono">{count(fn)}</p></Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {list === null ? <p className="p-6 text-sm text-slate-400">Loading...</p> : items.length === 0 ? <Empty icon={Factory} title="No production records" hint="Add a foam block to start tracking." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead><tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-border">
                <th className="px-4 py-3 font-semibold">Block Ref</th><th className="px-4 font-semibold">Product</th><th className="px-4 font-semibold">Produced</th><th className="px-4 font-semibold">Ready At</th><th className="px-4 font-semibold">Weather</th><th className="px-4 font-semibold">Status</th><th className="px-4 font-semibold text-right">Actions</th>
              </tr></thead>
              <tbody>{items.map((p) => (
                <tr key={p.id} className="border-b border-border/60 hover:bg-slate-50" data-testid={`production-row-${p.id}`}>
                  <td className="px-4 py-3 font-semibold font-mono text-slate-800">{p.block_ref}</td>
                  <td className="px-4 text-slate-600">{[p.product, p.size].filter(Boolean).join(" ") || "-"} {p.quantity ? <span className="text-slate-400">× {p.quantity}</span> : null}</td>
                  <td className="px-4 text-slate-500">{p.production_time ? fmtDateTime(p.production_time) : fmtDate(p.production_date)}</td>
                  <td className="px-4 text-xs">{p.ready_at ? <span className={p.rest_elapsed ? "text-emerald-600 font-semibold" : "text-amber-600"}>{fmtDateTime(p.ready_at)}{p.rest_elapsed ? " ✓" : ""}</span> : <span className="text-slate-400">Not recorded</span>}</td>
                  <td className="px-4">{p.weather ? <span className="flex items-center gap-1"><Badge cls={W_META[p.weather]}>{p.weather}</Badge>{p.rain_risk && <CloudRain size={14} className="text-red-500" />}{p.cold_risk && <Snowflake size={14} className="text-blue-500" />}</span> : <span className="text-xs text-slate-400">Not assessed</span>}</td>
                  <td className="px-4"><Badge cls={META[p.status] || META.Planned}>{p.status}</Badge>{p.stock_added && <span className="ml-1 text-[10px] text-emerald-600 font-semibold">in stock</span>}</td>
                  <td className="px-4 text-right whitespace-nowrap">
                    {!p.stock_added && p.rest_elapsed && p.status !== "Cancelled" && <button onClick={() => setRecv({ id: p.id, ref: p.block_ref, stock_id: p.stock_id || "", quantity: p.quantity || 1 })} className="text-emerald-600 hover:underline text-xs font-semibold mr-3 inline-flex items-center gap-1" data-testid={`receive-production-${p.id}`}><PackageCheck size={13} /> Receive</button>}
                    <button onClick={() => setModal({ ...blank(), ...p, production_time: p.production_time || "" })} className="text-primary hover:underline text-xs font-semibold" data-testid={`edit-production-${p.id}`}>Update</button>
                  </td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? "Update Block" : "New Foam Block"} wide>
        {modal && <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input label="Block Reference *" value={modal.block_ref} onChange={(e) => setModal({ ...modal, block_ref: e.target.value })} data-testid="block-ref-input" />
            <Input label="Product" value={modal.product} onChange={(e) => setModal({ ...modal, product: e.target.value })} data-testid="production-product-input" />
            <Input label="Size" value={modal.size} onChange={(e) => setModal({ ...modal, size: e.target.value })} data-testid="production-size-input" />
            <Input label="Quantity (blocks)" type="number" value={modal.quantity} onChange={(e) => setModal({ ...modal, quantity: e.target.value })} data-testid="production-qty-input" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Production Date & Time" type="datetime-local" value={modal.production_time || ""} onChange={(e) => setModal({ ...modal, production_time: e.target.value })} data-testid="production-time-input" />
            <Input label="Responsible Team" value={modal.team} onChange={(e) => setModal({ ...modal, team: e.target.value })} data-testid="production-team-input" />
            <Select label="Status" value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value })} data-testid="production-status-select">
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </div>
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase">Manual weather assessment</p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-48"><Select value={modal.weather} onChange={(e) => setModal({ ...modal, weather: e.target.value })} data-testid="production-weather-select">
                <option value="">Not assessed</option><option>Suitable</option><option>Caution</option><option>Unsuitable</option>
              </Select></div>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={modal.rain_risk} onChange={(e) => setModal({ ...modal, rain_risk: e.target.checked })} data-testid="production-rain-checkbox" /> Rain (critical risk)</label>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={modal.cold_risk} onChange={(e) => setModal({ ...modal, cold_risk: e.target.checked })} data-testid="production-cold-checkbox" /> Cold (defect risk)</label>
            </div>
            {risky && <Input label="Override reason * (required to produce in unsuitable weather)" value={modal.override_reason} onChange={(e) => setModal({ ...modal, override_reason: e.target.value })} data-testid="production-override-input" />}
            {modal.cold_risk && !risky && <p className="text-xs text-amber-600">Cold conditions increase the risk of defects and cutting problems.</p>}
          </div>
          <Input label="Planned Cutting Date" type="date" value={modal.planned_cutting || ""} onChange={(e) => setModal({ ...modal, planned_cutting: e.target.value })} />
          <Textarea label="Notes" rows={2} value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} />
          <p className="text-xs text-slate-400">A block can become "Ready for Cutting" only after the resting period (Settings) has passed from its production time.</p>
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn><Btn disabled={busy} onClick={save} data-testid="save-production-btn">Save</Btn></div>
        </div>}
      </Modal>

      <Modal open={!!recv} onClose={() => setRecv(null)} title={`Receive ${recv?.ref || ""} into Finished Stock`}>
        {recv && <div className="space-y-4">
          <Select label="Finished stock product *" value={recv.stock_id} onChange={(e) => setRecv({ ...recv, stock_id: e.target.value })} data-testid="receive-stock-select">
            <option value="">Select...</option>{stock.map((s) => <option key={s.id} value={s.id}>{s.product} {s.size} (have {s.current})</option>)}
          </Select>
          <Input label="Finished quantity *" type="number" value={recv.quantity} onChange={(e) => setRecv({ ...recv, quantity: e.target.value })} data-testid="receive-qty-input" />
          <p className="text-xs text-slate-400">This posts one "Production Received" movement. It can only be done once per block.</p>
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setRecv(null)}>Cancel</Btn><Btn variant="success" disabled={busy} onClick={receive} data-testid="confirm-receive-btn">Receive</Btn></div>
        </div>}
      </Modal>
    </div>
  );
}
