import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate, fmtDateTime, today } from "@/lib/format";
import { Card, Btn, Input, Select, Modal, PageHeader, Empty } from "@/components/common";
import { Factory, Plus, Save, Trash2, Pencil } from "lucide-react";

export default function Production() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ date: today(), white_blocks: "", blue_blocks: "", notes: "" });
  const [stock, setStock] = useState([]);
  const [blockCuttings, setBlockCuttings] = useState([]);
  const [cutOpen, setCutOpen] = useState(false);
  const [cutForm, setCutForm] = useState({ block: "", size: "" });
  const [busy, setBusy] = useState(false);
  const [cutBusy, setCutBusy] = useState(false);
  const load = () => {
    api.get("/production/daily").then(setData).catch((e) => toast.error(apiError(e)));
    api.get("/production/block-cutting").then(setBlockCuttings).catch((e) => toast.error(apiError(e)));
    api.get("/stock").then(setStock).catch((e) => toast.error(apiError(e)));
  };
  useEffect(() => { load(); }, []);

  const availableSizes = [...new Set(stock.map((item) => item.size).filter(Boolean))].sort();

  const save = async () => {
    if (busy) return; setBusy(true);
    try {
      await api.post("/production/daily", { ...form, white_blocks: Number(form.white_blocks) || 0, blue_blocks: Number(form.blue_blocks) || 0 });
      toast.success("Production saved"); setForm({ ...form, white_blocks: "", blue_blocks: "", notes: "" }); load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const saveBlockCutting = async () => {
    if (!cutForm.block || !cutForm.size) return toast.error("Select a block and size");
    if (cutBusy) return;
    setCutBusy(true);
    try {
      if (cutForm.id) await api.put(`/production/block-cutting/${cutForm.id}`, cutForm);
      else await api.post("/production/block-cutting", cutForm);
      toast.success(cutForm.id ? "Block cutting updated" : "Block cutting recorded");
      setCutOpen(false);
      setCutForm({ block: "", size: "" });
      api.get("/production/block-cutting").then(setBlockCuttings).catch((e) => toast.error(apiError(e)));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setCutBusy(false);
    }
  };
  const deleteBlockCutting = async (record) => {
    if (!window.confirm(`Delete the ${record.block} ${record.size} block cutting record?`)) return;
    try {
      await api.del(`/production/block-cutting/${record.id}`);
      toast.success("Block cutting deleted");
      setBlockCuttings((current) => current.filter((item) => item.id !== record.id));
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const del = async (r) => { if (!window.confirm(`Delete production of ${fmtDate(r.date)}?`)) return; await api.del(`/production/daily/${r.id}`); load(); };
  const Tot = ({ l, v, k }) => (
    <Card className="p-4" data-testid={`prod-total-${k}`}><p className="text-xs text-slate-400 uppercase font-semibold">{l}</p>
      <p className="mt-1 font-mono text-slate-800"><span className="text-xl font-bold">{v?.white_blocks || 0}</span> white · <span className="text-xl font-bold text-blue-600">{v?.blue_blocks || 0}</span> blue</p></Card>);

  return (
    <div className="space-y-6">
      <PageHeader title="Production" subtitle="Blocks produced per day — white and blue" />
      <Card className="p-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="prod-date-input" />
          <Input label="White blocks" type="number" min="0" value={form.white_blocks} onChange={(e) => setForm({ ...form, white_blocks: e.target.value })} data-testid="prod-white-input" />
          <Input label="Blue blocks" type="number" min="0" value={form.blue_blocks} onChange={(e) => setForm({ ...form, blue_blocks: e.target.value })} data-testid="prod-blue-input" />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="prod-notes-input" />
          <Btn disabled={busy} onClick={save} data-testid="save-production-btn"><Save size={16} /> Save</Btn>
        </div>
        <p className="text-xs text-slate-400 mt-2">Saving the same date again replaces that day's numbers.</p>
      </Card>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold text-slate-800">Block Cutting</h2><p className="text-sm text-slate-500">Record cut block type and size without changing stock quantities.</p></div>
          <Btn onClick={() => { setCutForm({ block: "", size: "" }); setCutOpen(true); }} data-testid="add-block-cutting-btn"><Plus size={16} /> Add Block Cutted</Btn>
        </div>
        {blockCuttings.length === 0 ? <p className="text-sm text-slate-400">No block cutting records yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Block</th><th className="px-3 py-2">Size</th><th className="px-3 py-2">Date and Time</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
              <tbody>{blockCuttings.map((record) => <tr key={record.id} className="border-b border-border/70" data-testid={`block-cutting-row-${record.id}`}>
                <td className="px-3 py-2 font-semibold">{record.block}</td><td className="px-3 py-2">{record.size}</td><td className="px-3 py-2 text-slate-500">{fmtDateTime(record.created_at)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => { setCutForm({ id: record.id, block: record.block, size: record.size }); setCutOpen(true); }} className="mr-3 text-slate-400 hover:text-primary" aria-label={`Edit ${record.block} ${record.size}`} data-testid={`edit-block-cutting-${record.id}`}><Pencil size={15} /></button>
                  <button onClick={() => deleteBlockCutting(record)} className="text-slate-400 hover:text-red-600" aria-label={`Delete ${record.block} ${record.size}`} data-testid={`delete-block-cutting-${record.id}`}><Trash2 size={15} /></button>
                </td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Tot l="Today" v={data?.today} k="today" /><Tot l="This week" v={data?.week} k="week" /><Tot l="This month" v={data?.month} k="month" /></div>
      <Card className="overflow-hidden">
        {!data ? <p className="p-6 text-sm text-slate-400">Loading...</p> : data.rows.length === 0 ? <Empty icon={Factory} title="No production recorded yet" /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-border"><th className="px-4 py-3">Date</th><th className="px-4 text-right">White</th><th className="px-4 text-right">Blue</th><th className="px-4 text-right">Total</th><th className="px-4">Notes</th><th className="px-4" /></tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60" data-testid={`prod-row-${r.id}`}>
                <td className="px-4 py-3">{fmtDate(r.date)}</td><td className="px-4 text-right font-mono">{r.white_blocks}</td><td className="px-4 text-right font-mono text-blue-600">{r.blue_blocks}</td>
                <td className="px-4 text-right font-mono font-bold">{r.white_blocks + r.blue_blocks}</td><td className="px-4 text-slate-500">{r.notes}</td>
                <td className="px-4 text-right"><button onClick={() => setForm({ date: r.date, white_blocks: r.white_blocks, blue_blocks: r.blue_blocks, notes: r.notes || "" })} className="text-primary text-xs font-semibold mr-3">Edit</button><button onClick={() => del(r)} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button></td>
              </tr>))}</tbody>
          </table>)}
      </Card>
      <Modal open={cutOpen} onClose={() => setCutOpen(false)} title={cutForm.id ? "Edit Block Cutting" : "Add Block Cutted"}>
        <div className="space-y-4">
          <Select label="Which block?" value={cutForm.block} onChange={(event) => setCutForm({ block: event.target.value, size: "" })} data-testid="block-cutting-type-select">
            <option value="">Select block...</option><option value="Blue">Blue</option><option value="Bianco">Bianco</option>
          </Select>
          <Select label="Which size?" value={cutForm.size} onChange={(event) => setCutForm({ ...cutForm, size: event.target.value })} disabled={!cutForm.block || availableSizes.length === 0} data-testid="block-cutting-size-select">
            <option value="">{availableSizes.length ? "Select size..." : "No sizes available in Stock"}</option>
            {availableSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </Select>
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setCutOpen(false)}>Cancel</Btn><Btn disabled={cutBusy || !cutForm.block || !cutForm.size} onClick={saveBlockCutting} data-testid="save-block-cutting-btn">Confirm</Btn></div>
        </div>
      </Modal>
    </div>
  );
}
