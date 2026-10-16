import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { Card, Btn, Input, Select, Badge, Modal, PageHeader } from "@/components/common";
import { Building2, Receipt, Tag, Truck, Save, Pencil, Plus } from "lucide-react";

const TABS = [
  { k: "company", l: "Company", icon: Building2 },
  { k: "invoice", l: "Invoice & Tax", icon: Receipt },
  { k: "prices", l: "Price Lists", icon: Tag },
  { k: "drivers", l: "Drivers", icon: Truck },
];

export default function Settings() {
  const [tab, setTab] = useState("company");
  const [s, setS] = useState(null);
  const [prices, setPrices] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [pModal, setPModal] = useState(null);
  const [dModal, setDModal] = useState(null);
  const [zone, setZone] = useState(1);

  const load = () => {
    api.get("/settings").then(setS); api.get("/prices").then(setPrices); api.get("/drivers").then(setDrivers);
  };
  useEffect(() => { load(); }, []);

  const saveSettings = async () => {
    try { const r = await api.put("/settings", s); setS(r); toast.success("Settings saved"); }
    catch (e) { toast.error(apiError(e)); }
  };

  const savePrice = async () => {
    try {
      const body = { ...pModal, price: pModal.price === "" ? null : Number(pModal.price) };
      if (pModal.id) await api.put(`/prices/${pModal.id}`, body);
      else await api.post("/prices", body);
      toast.success("Price saved"); setPModal(null); api.get("/prices").then(setPrices);
    } catch (e) { toast.error(apiError(e)); }
  };

  const saveDriver = async () => {
    try {
      if (dModal.id) await api.put(`/drivers/${dModal.id}`, dModal);
      else await api.post("/drivers", dModal);
      toast.success("Driver saved"); setDModal(null); api.get("/drivers").then(setDrivers);
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!s) return <div className="text-slate-400">Loading...</div>;
  const zonePrices = prices.filter((p) => p.zone === zone);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure your business" />
      <div className="flex gap-2 mb-6 overflow-x-auto no-print">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} data-testid={`settings-tab-${t.k}`}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap ${tab === t.k ? "bg-primary text-white" : "bg-white border border-border text-slate-600"}`}>
            <t.icon size={16} /> {t.l}
          </button>
        ))}
      </div>

      {tab === "company" && (
        <Card className="p-6 max-w-2xl space-y-4">
          <Input label="Company Name" value={s.company_name} onChange={(e) => setS({ ...s, company_name: e.target.value })} data-testid="company-name-input" />
          <Input label="Address" value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Telephone" value={s.telephone} onChange={(e) => setS({ ...s, telephone: e.target.value })} />
            <Input label="Email" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} />
          </div>
          <label className="block"><span className="block text-xs font-semibold text-slate-500 mb-1.5">Banking Details</span>
            <textarea rows={3} value={s.banking_details} onChange={(e) => setS({ ...s, banking_details: e.target.value })} className="w-full rounded-lg border border-input px-3 py-2.5 text-sm" /></label>
          <Input label="Tax Number (optional)" value={s.tax_number} onChange={(e) => setS({ ...s, tax_number: e.target.value })} />
          <Btn onClick={saveSettings} data-testid="save-settings-btn"><Save size={16} /> Save Settings</Btn>
        </Card>
      )}

      {tab === "invoice" && (
        <Card className="p-6 max-w-2xl space-y-4">
          <Input label="Invoice Prefix" value={s.invoice_prefix} onChange={(e) => setS({ ...s, invoice_prefix: e.target.value })} />
          <Select label="Default Payment Terms" value={s.default_payment_terms} onChange={(e) => setS({ ...s, default_payment_terms: e.target.value })}>
            {s.payment_terms.map((t) => <option key={t}>{t}</option>)}
          </Select>
          <div className="border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <input type="checkbox" checked={s.tax_enabled} onChange={(e) => setS({ ...s, tax_enabled: e.target.checked })} data-testid="tax-enabled-toggle" /> Enable Tax on Invoices
            </label>
            {s.tax_enabled && <Input label="Tax Rate (%)" type="number" value={s.tax_rate} onChange={(e) => setS({ ...s, tax_rate: Number(e.target.value) })} className="max-w-xs" />}
            <p className="text-xs text-slate-400 mt-2">Business is not assumed VAT registered. Tax is off by default.</p>
          </div>
          <Input label="Default Resting Time (hours)" type="number" value={s.resting_hours} onChange={(e) => setS({ ...s, resting_hours: Number(e.target.value) })} className="max-w-xs" />
          <Input label="Safety Stock Level" type="number" value={s.safety_stock} onChange={(e) => setS({ ...s, safety_stock: Number(e.target.value) })} className="max-w-xs" />
          <Btn onClick={saveSettings} data-testid="save-invoice-settings-btn"><Save size={16} /> Save Settings</Btn>
        </Card>
      )}

      {tab === "prices" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {[1, 2].map((z) => <button key={z} onClick={() => setZone(z)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${zone === z ? "bg-primary text-white" : "bg-white border border-border text-slate-600"}`}>Zone {z}</button>)}
            </div>
            <Btn onClick={() => setPModal({ zone, category: "Standard", size: "", price: "", active: true })} data-testid="add-price-btn"><Plus size={16} /> Add Price</Btn>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-border">
                  <th className="px-4 py-3 font-semibold">Category</th><th className="px-4 font-semibold">Size</th><th className="px-4 font-semibold text-right">Unit Price</th><th className="px-4 font-semibold text-center">Status</th><th className="px-4 font-semibold text-right">Edit</th>
                </tr></thead>
                <tbody>{zonePrices.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{p.category}</td>
                    <td className="px-4 font-mono text-slate-600">{p.size}</td>
                    <td className="px-4 text-right font-mono">{p.price == null ? <span className="text-red-600 text-xs font-semibold">NEEDS CONFIG</span> : fmtMoney(p.price)}</td>
                    <td className="px-4 text-center"><Badge cls={p.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}>{p.active ? "Active" : "Inactive"}</Badge></td>
                    <td className="px-4 text-right"><button onClick={() => setPModal({ ...p, price: p.price == null ? "" : p.price })} className="text-slate-400 hover:text-primary p-1" data-testid={`edit-price-${p.id}`}><Pencil size={15} /></button></td>
                  </tr>))}</tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "drivers" && (
        <div>
          <div className="flex justify-end mb-4"><Btn onClick={() => setDModal({ name: "", preferences: "", size_pref: "small", active: true })} data-testid="add-driver-btn"><Plus size={16} /> Add Driver</Btn></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {drivers.map((d) => (
              <Card key={d.id} className="p-5">
                <div className="flex items-center justify-between mb-2"><h4 className="font-bold text-slate-800">{d.name}</h4>
                  <div className="flex items-center gap-2"><Badge cls="bg-blue-50 text-blue-700 border-blue-200">{d.size_pref}</Badge>
                    <button onClick={() => setDModal({ ...d })} className="text-slate-400 hover:text-primary"><Pencil size={15} /></button></div></div>
                <p className="text-sm text-slate-500">{d.preferences}</p>
              </Card>))}
          </div>
        </div>
      )}

      <Modal open={!!pModal} onClose={() => setPModal(null)} title={pModal?.id ? "Edit Price" : "Add Price"}>
        {pModal && <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Zone" value={pModal.zone} onChange={(e) => setPModal({ ...pModal, zone: Number(e.target.value) })}><option value={1}>Zone 1</option><option value={2}>Zone 2</option></Select>
            <Input label="Category" value={pModal.category} onChange={(e) => setPModal({ ...pModal, category: e.target.value })} />
          </div>
          <Input label="Size" value={pModal.size} onChange={(e) => setPModal({ ...pModal, size: e.target.value })} placeholder="910x100" />
          <Input label="Unit Price (R) — leave empty if unconfirmed" type="number" step="0.01" value={pModal.price} onChange={(e) => setPModal({ ...pModal, price: e.target.value })} data-testid="price-value-input" />
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={pModal.active} onChange={(e) => setPModal({ ...pModal, active: e.target.checked })} /> Active</label>
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setPModal(null)}>Cancel</Btn><Btn onClick={savePrice} data-testid="save-price-btn">Save</Btn></div>
        </div>}
      </Modal>

      <Modal open={!!dModal} onClose={() => setDModal(null)} title={dModal?.id ? "Edit Driver" : "Add Driver"}>
        {dModal && <div className="space-y-4">
          <Input label="Name" value={dModal.name} onChange={(e) => setDModal({ ...dModal, name: e.target.value })} data-testid="driver-name-input" />
          <Select label="Size Preference" value={dModal.size_pref} onChange={(e) => setDModal({ ...dModal, size_pref: e.target.value })}>
            <option value="small">Small / Medium</option><option value="large">Large / Long-distance</option>
          </Select>
          <label className="block"><span className="block text-xs font-semibold text-slate-500 mb-1.5">Preferences</span>
            <textarea rows={3} value={dModal.preferences} onChange={(e) => setDModal({ ...dModal, preferences: e.target.value })} className="w-full rounded-lg border border-input px-3 py-2.5 text-sm" /></label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={dModal.active} onChange={(e) => setDModal({ ...dModal, active: e.target.checked })} /> Active</label>
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setDModal(null)}>Cancel</Btn><Btn onClick={saveDriver} data-testid="save-driver-btn">Save</Btn></div>
        </div>}
      </Modal>
    </div>
  );
}
