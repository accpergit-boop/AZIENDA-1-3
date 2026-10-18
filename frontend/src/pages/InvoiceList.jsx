import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { fmtMoney, fmtDate, STATUS_META } from "@/lib/format";
import { Card, Btn, Badge, PageHeader, Empty } from "@/components/common";
import { FileText, Search, Plus, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usesUnifiedPriceList } from "@/lib/company";

export default function InvoiceList() {
  const { user } = useAuth();
  const unifiedPriceList = usesUnifiedPriceList(user?.company_id);
  const [list, setList] = useState([]);
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [status, setStatus] = useState("all");
  const [zone, setZone] = useState("all");
  const nav = useNavigate();
  const [sel, setSel] = useState([]);
  const load = () => api.get("/invoices").then((d) => { setList(d); setSel([]); });
  useEffect(() => { load(); }, []);

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const removeMany = async (ids) => {
    const invs = list.filter((i) => ids.includes(i.id));
    const paid = invs.filter((i) => i.amount_paid > 0).length;
    if (!window.confirm(`Delete ${ids.length} invoice(s)${paid ? ` — ${paid} with payments; their payments will be deleted too` : ""}? This cannot be undone.`)) return;
    try { const r = await api.post("/invoices/bulk-delete", { ids }); toast.success(`${r.deleted} invoice(s) deleted`); load(); } catch (e) { toast.error(apiError(e)); }
  };

  const filtered = list.filter((i) => {
    const text = `${i.number || ""} ${i.customer_name}`.toLowerCase();
    return text.includes(q.toLowerCase()) &&
      (status === "all" || i.status === status) &&
      (zone === "all" || String(i.zone) === zone);
  });

  return (
    <div>
      <PageHeader title="Invoices" subtitle={`${list.length} invoices`}>
        <Btn onClick={() => nav("/invoices/new")} data-testid="new-invoice-btn"><Plus size={16} /> Create Invoice</Btn>
      </PageHeader>

      <Card className={`p-4 mb-4 grid grid-cols-1 ${unifiedPriceList ? "sm:grid-cols-3" : "sm:grid-cols-4"} gap-3`}>
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input data-testid="invoice-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or customer..."
            className="w-full rounded-lg border border-input pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-input px-3 py-2.5 text-sm" data-testid="invoice-status-filter">
          <option value="all">All Statuses</option>
          {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        {!unifiedPriceList && <select value={zone} onChange={(e) => setZone(e.target.value)} className="rounded-lg border border-input px-3 py-2.5 text-sm">
          <option value="all">All Zones</option><option value="1">Zone 1</option><option value="2">Zone 2</option>
        </select>}
      </Card>

      {sel.length > 0 && <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-2" data-testid="bulk-bar">
        <span className="text-sm font-semibold text-red-700">{sel.length} selected</span>
        <Btn variant="danger" onClick={() => removeMany(sel)} data-testid="bulk-delete-btn"><Trash2 size={15} /> Delete selected</Btn>
      </div>}

      <Card className="overflow-hidden">
        {filtered.length === 0 ? <Empty icon={FileText} title="No invoices found" hint="Create your first invoice to get started." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-border">
                <th className="px-3 py-3 w-8"><input type="checkbox" checked={sel.length > 0 && sel.length === filtered.length} onChange={(e) => setSel(e.target.checked ? filtered.map((i) => i.id) : [])} data-testid="select-all-invoices" /></th><th className="px-4 py-3 font-semibold">Invoice</th><th className="px-4 font-semibold">Customer</th><th className="px-4 font-semibold">Date</th><th className="px-4 font-semibold">Due</th>{!unifiedPriceList && <th className="px-4 font-semibold">Zone</th>}<th className="px-4 font-semibold text-right">Total</th><th className="px-4 font-semibold text-right">Paid</th><th className="px-4 font-semibold text-right">Balance</th><th className="px-4 font-semibold text-center">Status</th><th className="px-4 font-semibold text-right">Actions</th>
              </tr></thead>
              <tbody>{filtered.map((i) => (
                <tr key={i.id} className="border-b border-border/60 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`/invoices/${i.id}`)} data-testid={`invoice-row-${i.id}`}>
                  <td className="px-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.includes(i.id)} onChange={() => toggle(i.id)} data-testid={`select-invoice-${i.id}`} /></td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-700">{i.number || "DRAFT"}{i.opening_balance && <span className="ml-2 inline-block rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 font-sans" data-testid={`opening-badge-${i.id}`}>Opening Balance</span>}</td>
                  <td className="px-4 text-slate-600">{i.customer_name}</td>
                  <td className="px-4 text-slate-500">{fmtDate(i.date)}</td>
                  <td className="px-4 text-slate-500">{fmtDate(i.due_date)}</td>
                  {!unifiedPriceList && <td className="px-4"><Badge cls="bg-blue-50 text-blue-700 border-blue-200">Z{i.zone}</Badge></td>}
                  <td className="px-4 text-right font-mono text-slate-700">{fmtMoney(i.total)}</td>
                  <td className="px-4 text-right font-mono text-emerald-600">{fmtMoney(i.amount_paid)}</td>
                  <td className="px-4 text-right font-mono text-red-600">{fmtMoney(i.outstanding)}</td>
                  <td className="px-4 text-center"><Badge cls={STATUS_META[i.status]?.cls}>{STATUS_META[i.status]?.label}</Badge></td>
                  <td className="px-4 text-right">{i.status !== "void" && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); nav(`/invoices/${i.id}?pdf=1`); }} data-testid={`pdf-invoice-row-${i.id}`} title="Download PDF" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-primary hover:text-primary transition-colors">
                        <Download size={12} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); nav(`/invoices/${i.id}?edit=1`); }} data-testid={`edit-invoice-row-${i.id}`}
                        className="ml-2 inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-blue-50 transition-colors">
                        <Pencil size={12} /> Edit
                      </button>
                    </>
                  )}
                    <button onClick={(e) => { e.stopPropagation(); removeMany([i.id]); }} data-testid={`delete-invoice-row-${i.id}`} className="ml-2 inline-flex items-center rounded-lg border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"><Trash2 size={12} /></button></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
