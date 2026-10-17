import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Card, Btn, Input, Select, Badge, Modal, PageHeader } from "@/components/common";
import { Building2, Receipt, Tag, Truck, Save, Pencil, Plus, ShieldCheck, Fuel, MapPin, Smartphone, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const TABS = [
  { k: "company", l: "Company", icon: Building2 },
  { k: "invoice", l: "Invoice & Tax", icon: Receipt },
  { k: "prices", l: "Price Lists", icon: Tag },
  { k: "drivers", l: "Drivers", icon: Truck },
  { k: "diesel", l: "Diesel", icon: Fuel },
  { k: "access", l: "Access", icon: ShieldCheck },
];

function AccessTab({ users, loading, currentUserId, onRoleChange, onRemove }) {
  const adminCount = users.filter((u) => u.role === "admin").length;
  return (
    <Card className="p-5 space-y-4" data-testid="access-tab">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800 font-display">Accounts and devices</h3>
          <p className="text-sm text-slate-500 mt-1">Google accounts and self-registered accounts can sign in without prior approval. Precise location appears only when the user shares it.</p>
        </div>
        <Badge cls="bg-blue-50 text-blue-700 border-blue-200">Admins {adminCount}/6</Badge>
      </div>
      {loading ? <p className="text-sm text-slate-400 py-4">Loading accounts...</p> : users.length === 0 ? <p className="text-sm text-slate-400 py-4">No accounts found.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-slate-400">
              <th className="py-2 font-semibold">Account</th><th className="font-semibold">Role</th><th className="font-semibold">Device</th><th className="font-semibold">Location</th><th className="font-semibold">Last active</th><th />
            </tr></thead>
            <tbody>{users.map((account) => (
              <tr key={account.id} className="border-b border-border/60 align-top" data-testid={`access-user-${account.id}`}>
                <td className="py-3 pr-3"><p className="font-semibold text-slate-700">{account.name || "-"}</p><p className="text-xs text-slate-500">{account.email}</p></td>
                <td className="py-3 pr-3">
                  {account.is_owner ? <Badge cls="bg-amber-50 text-amber-700 border-amber-200">Owner</Badge> :
                    <Select aria-label={`Role for ${account.email}`} value={account.role} onChange={(e) => onRoleChange(account, e.target.value)} data-testid={`access-role-${account.id}`}>
                      <option value="user">User</option><option value="admin" disabled={adminCount >= 6 && account.role !== "admin"}>Admin</option>
                    </Select>}
                </td>
                <td className="py-3 pr-3">{account.devices.length ? account.devices.map((device) => (
                  <div key={device.device_id} className="mb-2 last:mb-0">
                    <p className="flex items-center gap-1 text-xs text-slate-700"><Smartphone size={13} /> <span className="max-w-48 truncate">{device.device_name}</span></p>
                    <p className="text-[11px] text-slate-400">{device.ip_address || "IP unavailable"} · {device.timezone || "Time zone unavailable"}</p>
                  </div>)) : <span className="text-xs text-slate-400">No device recorded</span>}</td>
                <td className="py-3 pr-3">{account.devices.map((device) => device.location ? (
                  <a key={device.device_id} href={`https://www.openstreetmap.org/?mlat=${device.location.latitude}&mlon=${device.location.longitude}#map=15/${device.location.latitude}/${device.location.longitude}`} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-1 text-xs font-semibold text-primary underline">
                    <MapPin size={13} /> {device.location.latitude.toFixed(4)}, {device.location.longitude.toFixed(4)}
                  </a>) : <p key={device.device_id} className="mb-2 text-xs text-slate-400">Not shared</p>)}</td>
                <td className="py-3 text-xs text-slate-500">{account.devices.length ? account.devices.map((device) => <p key={device.device_id}>{fmtDateTime(device.last_seen)}</p>) : "-"}</td>
                <td className="py-3 text-right">{!account.is_owner && account.id !== currentUserId && <button type="button" onClick={() => onRemove(account)} title={`Remove ${account.email}`} aria-label={`Remove ${account.email}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" data-testid={`remove-user-${account.id}`}><Trash2 size={16} /></button>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState("company");
  const [s, setS] = useState(null);
  const [dieselPrice, setDieselPrice] = useState("");
  const [dieselSaving, setDieselSaving] = useState(false);
  const [prices, setPrices] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [accessUsers, setAccessUsers] = useState([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [removeUser, setRemoveUser] = useState(null);
  const [removingUser, setRemovingUser] = useState(false);
  const [pModal, setPModal] = useState(null);
  const [dModal, setDModal] = useState(null);
  const [zone, setZone] = useState(1);

  const load = () => {
    api.get("/settings").then((settings) => { setS(settings); setDieselPrice(settings.diesel_price == null ? "" : String(settings.diesel_price)); });
    api.get("/prices").then(setPrices); api.get("/drivers").then(setDrivers);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (tab !== "access" || !user?.is_admin) return;
    setAccessLoading(true);
    api.get("/access/users").then(setAccessUsers).catch((e) => toast.error(apiError(e))).finally(() => setAccessLoading(false));
  }, [tab, user?.is_admin]);

  const changeRole = async (account, role) => {
    try {
      await api.put(`/access/users/${account.id}/role`, { role });
      setAccessUsers((current) => current.map((u) => u.id === account.id ? { ...u, role } : u));
      toast.success(`${account.email} is now ${role}`);
    } catch (e) { toast.error(apiError(e)); }
  };

  const confirmRemoveUser = async () => {
    if (!removeUser) return;
    setRemovingUser(true);
    try {
      await api.del(`/access/users/${removeUser.id}`);
      setAccessUsers((current) => current.filter((u) => u.id !== removeUser.id));
      toast.success("Account removed");
      setRemoveUser(null);
    } catch (e) { toast.error(apiError(e)); } finally { setRemovingUser(false); }
  };

  const saveSettings = async () => {
    try { const r = await api.put("/settings", s); setS(r); toast.success("Settings saved"); }
    catch (e) { toast.error(apiError(e)); }
  };

  const saveDieselPrice = async () => {
    const price = Number(dieselPrice);
    if (!Number.isFinite(price) || price <= 0) return toast.error("Enter a valid diesel price");
    setDieselSaving(true);
    try {
      const r = await api.put("/settings/diesel", { price_per_l: price });
      setS((current) => ({ ...current, ...r }));
      setDieselPrice(String(r.diesel_price));
      toast.success("Diesel price updated");
    } catch (e) { toast.error(apiError(e)); } finally { setDieselSaving(false); }
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
        {TABS.filter((t) => t.k !== "diesel" || user?.is_admin).map((t) => (
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

      {tab === "diesel" && user?.is_admin && (
        <Card className="p-6 max-w-2xl space-y-4" data-testid="diesel-settings-tab">
          <div>
            <h3 className="font-bold text-slate-800 font-display">Diesel price · Kokstad</h3>
            <p className="text-sm text-slate-500 mt-1">Check the current local price on <a href="https://petrolprices.co.za/" target="_blank" rel="noreferrer" className="font-semibold text-primary underline">PetrolPrices.co.za</a>, then enter it here. Only an administrator can save a new price.</p>
          </div>
          <Input label="Diesel price per litre (R)" type="number" min="0" step="0.01" value={dieselPrice} onChange={(e) => setDieselPrice(e.target.value)} data-testid="diesel-price-input" />
          <p className="text-xs text-slate-500">Last updated: {s.diesel_updated_at ? fmtDateTime(s.diesel_updated_at) : "Never"}</p>
          <div><Btn onClick={saveDieselPrice} disabled={dieselSaving} data-testid="save-diesel-price-btn"><Save size={16} /> {dieselSaving ? "Saving..." : "Save Diesel Price"}</Btn></div>
        </Card>
      )}

      {tab === "access" && user?.is_admin && <AccessTab users={accessUsers} loading={accessLoading} currentUserId={user.id} onRoleChange={changeRole} onRemove={setRemoveUser} />}

      <Modal open={!!removeUser} onClose={() => !removingUser && setRemoveUser(null)} title="Remove Account">
        {removeUser && <div className="space-y-4">
          <p className="text-sm text-slate-600">Remove <b>{removeUser.email}</b>? Their sessions, device records and assistant conversations will also be deleted. This cannot be undone.</p>
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setRemoveUser(null)} disabled={removingUser}>Cancel</Btn><Btn variant="danger" onClick={confirmRemoveUser} disabled={removingUser} data-testid="confirm-remove-user">{removingUser ? "Removing..." : "Remove account"}</Btn></div>
        </div>}
      </Modal>

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
