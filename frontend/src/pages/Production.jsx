import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate, today } from "@/lib/format";
import { Card, Btn, Input, PageHeader, Empty } from "@/components/common";
import { Factory, Save, Trash2 } from "lucide-react";

export default function Production() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ date: today(), white_blocks: "", blue_blocks: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/production/daily").then(setData).catch((e) => toast.error(apiError(e)));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (busy) return; setBusy(true);
    try {
      await api.post("/production/daily", { ...form, white_blocks: Number(form.white_blocks) || 0, blue_blocks: Number(form.blue_blocks) || 0 });
      toast.success("Production saved"); setForm({ ...form, white_blocks: "", blue_blocks: "", notes: "" }); load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
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
    </div>
  );
}
