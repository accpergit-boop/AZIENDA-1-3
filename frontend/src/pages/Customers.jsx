import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtMoney, fmtDate, STATUS_META } from "@/lib/format";
import { Card, Btn, Input, Select, Badge, Modal, PageHeader, Empty } from "@/components/common";
import { Users, Search, Plus, Pencil, Eye } from "lucide-react";

const blank = { name: "", phone: "", email: "", address: "", default_zone: 1, payment_terms: "Due on Delivery", active: true };

export default function Customers() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null); // form data or null
  const [profile, setProfile] = useState(null);
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();

  const load = () => api.get("/customers").then(setList);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (sp.get("add")) { setModal({ ...blank }); setSp({}); } }, [sp]);

  const save = async () => {
    if (!modal.name.trim()) return toast.error("Name is required");
    try {
      if (modal.id) await api.put(`/customers/${modal.id}`, modal);
      else await api.post("/customers", modal);
      toast.success("Customer saved");
      setModal(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const openProfile = async (c) => {
    const s = await api.get(`/customers/${c.id}/summary`);
    setProfile({ c, ...s });
  };

  const filtered = list.filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase()) &&
    (filter === "all" || (filter === "active" ? c.active : !c.active)));

  return (
    <div>
      <PageHeader title="Customers" subtitle={`${list.length} customers`}>
        <Btn onClick={() => setModal({ ...blank })} data-testid="add-customer-btn"><Plus size={16} /> Add Customer</Btn>
      </PageHeader>

      <Card className="p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input data-testid="customer-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers..."
            className="w-full rounded-lg border border-input pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="customer-filter"
          className="rounded-lg border border-input px-3 py-2.5 text-sm outline-none">
          <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </Card>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? <Empty icon={Users} title="No customers found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-border">
                <th className="px-4 py-3 font-semibold">Name</th><th className="px-4 font-semibold">Phone</th><th className="px-4 font-semibold">Zone</th><th className="px-4 font-semibold">Terms</th><th className="px-4 font-semibold text-center">Status</th><th className="px-4 font-semibold text-right">Actions</th>
              </tr></thead>
              <tbody>{filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/60 hover:bg-slate-50" data-testid={`customer-row-${c.id}`}>
                  <td className="px-4 py-3 font-semibold text-slate-800">{c.name}</td>
                  <td className="px-4 text-slate-500">{c.phone || "-"}</td>
                  <td className="px-4"><Badge cls="bg-blue-50 text-blue-700 border-blue-200">Zone {c.default_zone}</Badge></td>
                  <td className="px-4 text-slate-500">{c.payment_terms}</td>
                  <td className="px-4 text-center"><Badge cls={c.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}>{c.active ? "Active" : "Inactive"}</Badge></td>
                  <td className="px-4 text-right whitespace-nowrap">
                    <button onClick={() => openProfile(c)} className="text-slate-400 hover:text-primary p-1.5" data-testid={`view-customer-${c.id}`}><Eye size={16} /></button>
                    <button onClick={() => setModal({ ...c })} className="text-slate-400 hover:text-primary p-1.5" data-testid={`edit-customer-${c.id}`}><Pencil size={16} /></button>
                  </td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? "Edit Customer" : "Add Customer"}>
        {modal && (
          <div className="space-y-4">
            <Input label="Name *" value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} data-testid="customer-name-input" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Phone" value={modal.phone} onChange={(e) => setModal({ ...modal, phone: e.target.value })} />
              <Input label="Email" value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} />
            </div>
            <Input label="Address" value={modal.address} onChange={(e) => setModal({ ...modal, address: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Default Price Zone" value={modal.default_zone} onChange={(e) => setModal({ ...modal, default_zone: Number(e.target.value) })}>
                <option value={1}>Zone 1</option><option value={2}>Zone 2</option>
              </Select>
              <Select label="Payment Terms" value={modal.payment_terms} onChange={(e) => setModal({ ...modal, payment_terms: e.target.value })}>
                {["Due on Delivery", "Cash on Delivery", "7 Days", "14 Days", "30 Days", "Custom Terms"].map((t) => <option key={t}>{t}</option>)}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input type="checkbox" checked={modal.active} onChange={(e) => setModal({ ...modal, active: e.target.checked })} /> Active
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn onClick={save} data-testid="save-customer-btn">Save Customer</Btn>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!profile} onClose={() => setProfile(null)} title={profile?.c.name} wide>
        {profile && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-400">Zone</p><p className="font-bold text-slate-800">Zone {profile.c.default_zone}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-400">Terms</p><p className="font-bold text-slate-800 text-sm">{profile.c.payment_terms}</p></div>
              <div className="rounded-lg bg-blue-50 p-3"><p className="text-xs text-slate-400">Total Invoiced</p><p className="font-bold text-slate-800 font-mono">{fmtMoney(profile.total_invoiced)}</p></div>
              <div className="rounded-lg bg-red-50 p-3"><p className="text-xs text-slate-400">Outstanding</p><p className="font-bold text-red-600 font-mono">{fmtMoney(profile.outstanding)}</p></div>
            </div>
            <div>
              <h4 className="font-bold text-slate-700 mb-2 text-sm">Invoice History</h4>
              {profile.invoices.length === 0 ? <p className="text-sm text-slate-400">No invoices.</p> : (
                <div className="space-y-1.5">{profile.invoices.map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-50" onClick={() => nav(`/invoices/${i.id}`)}>
                    <span className="font-mono font-semibold">{i.number || "DRAFT"}</span>
                    <span className="text-slate-500">{fmtDate(i.date)}</span>
                    <span className="font-mono">{fmtMoney(i.total)}</span>
                    <Badge cls={STATUS_META[i.status]?.cls}>{STATUS_META[i.status]?.label}</Badge>
                  </div>))}</div>
              )}
            </div>
            <div>
              <h4 className="font-bold text-slate-700 mb-2 text-sm">Payments</h4>
              {profile.payments.length === 0 ? <p className="text-sm text-slate-400">No payments.</p> : (
                <div className="space-y-1.5">{profile.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
                    <span>{fmtDate(p.date)} · {p.method}</span><span className="font-mono text-emerald-600 font-semibold">{fmtMoney(p.amount)}</span>
                  </div>))}</div>
              )}
            </div>
            <div className="flex justify-end"><Btn onClick={() => nav("/invoices/new")}><Plus size={16} /> New Invoice</Btn></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
