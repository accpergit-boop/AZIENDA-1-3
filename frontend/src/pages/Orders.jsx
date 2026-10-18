import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Card, Btn, Input, Select, Textarea, Badge, Modal, PageHeader, Empty } from "@/components/common";
import { ClipboardList, Plus, Trash2, Pencil, ArrowRight, FileText, Printer, Download } from "lucide-react";
import { useRef } from "react";
import { DeliveryNote, orderLines } from "@/components/DeliveryNote";
import { elementToPdf, printElement } from "@/lib/pdf";

const STATUSES = ["To Send", "Preparing", "Assigned", "Dispatched", "Delivered", "Cancelled"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const S_META = {
  "To Send": "bg-slate-100 text-slate-700 border-slate-200", Preparing: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Assigned: "bg-blue-50 text-blue-700 border-blue-200", Dispatched: "bg-amber-50 text-amber-700 border-amber-200",
  Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200", Cancelled: "bg-slate-100 text-slate-400 border-slate-200",
};
const P_META = {
  Low: "bg-slate-100 text-slate-500 border-slate-200", Normal: "bg-blue-50 text-blue-700 border-blue-200",
  High: "bg-orange-50 text-orange-700 border-orange-200", Urgent: "bg-red-50 text-red-700 border-red-200",
};
const P_RANK = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const OPEN = ["To Send", "Preparing", "Assigned"];
const blank = () => ({ customer_id: "", customer_name: "", destination: "", products: "", items: [{ qty: "", category: "", size: "" }], priority: "Normal", status: "To Send", expected_ship_date: "", vehicle_id: "", notes: "" });

function NoteModal({ order, vehicleName, settings, onClose }) {
  const ref = useRef(null);
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState(false);
  const pdf = async () => { setBusy(true); try { await elementToPdf(ref.current, `delivery-note-${order.reference}-${lang}.pdf`); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  return (
    <Modal open={!!order} onClose={onClose} title={`Delivery Note ${order?.reference || ""}`} wide>
      {order && <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44"><Select label="Language" value={lang} onChange={(e) => setLang(e.target.value)} data-testid="note-lang-select"><option value="en">English</option><option value="ur">Urdu (اردو)</option></Select></div>
          <Btn variant="outline" onClick={() => printElement(ref.current, order.reference) || toast.error("Allow pop-ups to print")} data-testid="note-print-btn"><Printer size={15} /> Print</Btn>
          <Btn disabled={busy} onClick={pdf} data-testid="note-pdf-btn"><Download size={15} /> {busy ? "Generating..." : "Download PDF"}</Btn>
        </div>
        <div className="overflow-x-auto bg-slate-100 p-4 rounded-lg"><div className="shadow-md w-fit mx-auto"><DeliveryNote ref={ref} order={order} lang={lang} vehicleName={vehicleName} settings={settings} /></div></div>
      </div>}
    </Modal>
  );
}

export default function Orders() {
  const [list, setList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [filter, setFilter] = useState("open");
  const [modal, setModal] = useState(null);
  const [note, setNote] = useState(null);
  const [stock, setStock] = useState([]);
  const [settings, setSettings] = useState({});
  const products = [...new Set(stock.map((s) => s.product))];

  const load = () => { api.get("/orders").then(setList); };
  useEffect(() => { load(); api.get("/customers").then(setCustomers); api.get("/vehicles").then(setVehicles); api.get("/stock").then(setStock); api.get("/settings").then(setSettings); }, []);

  const vName = (id) => vehicles.find((v) => v.id === id)?.name;
  const shown = useMemo(() => {
    const f = filter === "open" ? list.filter((o) => OPEN.includes(o.status)) : filter === "all" ? list : list.filter((o) => o.status === filter);
    return [...f].sort((a, b) => (P_RANK[a.priority] ?? 9) - (P_RANK[b.priority] ?? 9) || (a.expected_ship_date || "9").localeCompare(b.expected_ship_date || "9"));
  }, [list, filter]);
  const count = (s) => (s === "open" ? list.filter((o) => OPEN.includes(o.status)).length : s === "all" ? list.length : list.filter((o) => o.status === s).length);

  const pickCustomer = (id) => {
    const c = customers.find((x) => x.id === id);
    setModal({ ...modal, customer_id: id, customer_name: c?.name || "", destination: modal.destination || c?.city || c?.address || "" });
  };

  const save = async () => {
    if (!modal.customer_id && !modal.customer_name.trim()) return toast.error("Customer required");
    if (!modal.destination.trim()) return toast.error("City / destination required");
    try {
      const items = (modal.items || []).filter((i) => Number(i.qty) > 0 && i.category).map((i) => ({ ...i, qty: Number(i.qty) }));
      const payload = { ...modal, items, products: items.map((i) => `${i.qty} x ${i.category} ${i.size}`.trim()).join("\n") || modal.products };
      if (modal.id) await api.put(`/orders/${modal.id}`, payload);
      else await api.post("/orders", payload);
      toast.success("Order saved"); setModal(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const advance = async (o) => {
    const next = STATUSES[STATUSES.indexOf(o.status) + 1];
    try { await api.put(`/orders/${o.id}`, { ...o, status: next }); toast.success(`Marked ${next}`); load(); } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (o) => {
    if (!window.confirm(`Delete order ${o.reference}?`)) return;
    try { await api.del(`/orders/${o.id}`); toast.success("Order deleted"); load(); } catch (e) { toast.error(apiError(e)); }
  };

  const tabs = ["open", ...STATUSES, "all"];
  return (
    <div className="space-y-6">
      <PageHeader title="Orders to Send" subtitle="Track orders waiting to be prepared and shipped">
        <Btn onClick={() => setModal(blank())} data-testid="add-order-btn"><Plus size={16} /> New Order</Btn>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t} onClick={() => setFilter(t)} data-testid={`order-filter-${t.toLowerCase().replace(/\s/g, "-")}`}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filter === t ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-border hover:border-primary"}`}>
            {t === "open" ? "Open" : t === "all" ? "All" : t} <span className="opacity-70 ml-1">{count(t)}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {shown.length === 0 ? <Empty icon={ClipboardList} title="No orders here" hint="Create an order to start tracking shipments." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[960px]">
              <thead><tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-border">
                <th className="px-4 py-3 font-semibold">Ref</th><th className="px-4 font-semibold">Customer</th><th className="px-4 font-semibold">City</th><th className="px-4 font-semibold">Products</th><th className="px-4 font-semibold">Priority</th><th className="px-4 font-semibold">Status</th><th className="px-4 font-semibold">Ship Date</th><th className="px-4 font-semibold">Vehicle</th><th className="px-4 font-semibold text-right">Actions</th>
              </tr></thead>
              <tbody>{shown.map((o) => (
                <tr key={o.id} className="border-b border-border/60 hover:bg-slate-50 align-top" data-testid={`order-row-${o.id}`}>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800 whitespace-nowrap">{o.reference}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{o.customer_name || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{o.destination}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[240px] whitespace-pre-line">{orderLines(o).map((l) => `${l.qty} × ${[l.category, l.size].filter(Boolean).join(" ")}`).join("\n") || "-"}</td>
                  <td className="px-4 py-3"><Badge cls={P_META[o.priority]}>{o.priority}</Badge></td>
                  <td className="px-4 py-3"><Badge cls={S_META[o.status]}>{o.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{o.expected_ship_date ? fmtDate(o.expected_ship_date) : "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{vName(o.vehicle_id) || "-"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {o.status !== "Delivered" && o.status !== "Cancelled" && (
                      <button onClick={() => advance(o)} className="inline-flex items-center gap-1 text-emerald-600 hover:underline text-xs font-semibold mr-3" data-testid={`advance-order-${o.id}`}>
                        {STATUSES[STATUSES.indexOf(o.status) + 1]} <ArrowRight size={12} />
                      </button>)}
                    <button onClick={() => setNote(o)} className="text-slate-400 hover:text-primary mr-3" title="Delivery note" data-testid={`note-order-${o.id}`}><FileText size={15} /></button>
                    <button onClick={() => setModal({ ...o, items: o.items?.length ? o.items : [{ qty: "", category: "", size: "" }], expected_ship_date: o.expected_ship_date || "" })} className="text-slate-400 hover:text-primary mr-3" data-testid={`edit-order-${o.id}`}><Pencil size={15} /></button>
                    <button onClick={() => remove(o)} className="text-slate-400 hover:text-red-600" data-testid={`delete-order-${o.id}`}><Trash2 size={15} /></button>
                  </td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? `Edit Order ${modal.reference}` : "New Order"} wide>
        {modal && <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Customer *" value={modal.customer_id} onChange={(e) => pickCustomer(e.target.value)} data-testid="order-customer-select">
              <option value="">Select customer...</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input label="City / Destination *" value={modal.destination} onChange={(e) => setModal({ ...modal, destination: e.target.value })} data-testid="order-destination-input" />
            <Select label="Priority" value={modal.priority} onChange={(e) => setModal({ ...modal, priority: e.target.value })} data-testid="order-priority-select">
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </Select>
            <Select label="Status" value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value })} data-testid="order-status-select">
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </Select>
            <Input label="Expected Ship Date" type="date" value={modal.expected_ship_date} onChange={(e) => setModal({ ...modal, expected_ship_date: e.target.value })} data-testid="order-ship-date-input" />
            <Select label="Assigned Vehicle" value={modal.vehicle_id} onChange={(e) => setModal({ ...modal, vehicle_id: e.target.value })} data-testid="order-vehicle-select">
              <option value="">Not assigned</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.length ? ` (${v.length})` : ""}</option>)}
            </Select>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1.5">Products (no prices)</p>
            <div className="space-y-2">{modal.items.map((it, i) => {
              const set = (patch) => setModal({ ...modal, items: modal.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="flex gap-2" data-testid={`order-item-${i}`}>
                  <input type="number" min="0" placeholder="Qty" value={it.qty} onChange={(e) => set({ qty: e.target.value })} className="w-20 rounded border border-input px-2 py-1.5 text-sm" data-testid={`order-item-qty-${i}`} />
                  <select value={it.category} onChange={(e) => set({ category: e.target.value, size: "" })} className="flex-1 rounded border border-input px-2 py-1.5 text-sm" data-testid={`order-item-cat-${i}`}>
                    <option value="">Product...</option>{products.map((p) => <option key={p}>{p}</option>)}</select>
                  <select value={it.size} onChange={(e) => set({ size: e.target.value })} className="w-32 rounded border border-input px-2 py-1.5 text-sm" data-testid={`order-item-size-${i}`}>
                    <option value="">Size...</option>{stock.filter((s) => s.product === it.category).map((s) => <option key={s.id}>{s.size}</option>)}</select>
                  <button onClick={() => setModal({ ...modal, items: modal.items.filter((_, k) => k !== i) })} className="text-slate-300 hover:text-red-600"><Trash2 size={15} /></button>
                </div>);
            })}</div>
            <Btn variant="outline" className="mt-2" onClick={() => setModal({ ...modal, items: [...modal.items, { qty: "", category: "", size: "" }] })} data-testid="order-add-item-btn"><Plus size={14} /> Add product</Btn>
          </div>
          <Textarea label="Notes" rows={2} value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} data-testid="order-notes-input" />
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn><Btn onClick={save} data-testid="save-order-btn">Save Order</Btn></div>
        </div>}
      </Modal>
      <NoteModal order={note} vehicleName={note ? vName(note.vehicle_id) : ""} settings={settings} onClose={() => setNote(null)} />
    </div>
  );
}
