import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { fmtMoney, fmtDate, STATUS_META } from "@/lib/format";
import { Card, Btn, Badge, PageHeader, Empty } from "@/components/common";
import { FileText, Search, Plus } from "lucide-react";

export default function InvoiceList() {
  const [list, setList] = useState([]);
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [status, setStatus] = useState("all");
  const [zone, setZone] = useState("all");
  const nav = useNavigate();

  useEffect(() => { api.get("/invoices").then(setList); }, []);

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

      <Card className="p-4 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input data-testid="invoice-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or customer..."
            className="w-full rounded-lg border border-input pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-input px-3 py-2.5 text-sm" data-testid="invoice-status-filter">
          <option value="all">All Statuses</option>
          {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={zone} onChange={(e) => setZone(e.target.value)} className="rounded-lg border border-input px-3 py-2.5 text-sm">
          <option value="all">All Zones</option><option value="1">Zone 1</option><option value="2">Zone 2</option>
        </select>
      </Card>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? <Empty icon={FileText} title="No invoices found" hint="Create your first invoice to get started." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-border">
                <th className="px-4 py-3 font-semibold">Invoice</th><th className="px-4 font-semibold">Customer</th><th className="px-4 font-semibold">Date</th><th className="px-4 font-semibold">Due</th><th className="px-4 font-semibold">Zone</th><th className="px-4 font-semibold text-right">Total</th><th className="px-4 font-semibold text-right">Paid</th><th className="px-4 font-semibold text-right">Balance</th><th className="px-4 font-semibold text-center">Status</th>
              </tr></thead>
              <tbody>{filtered.map((i) => (
                <tr key={i.id} className="border-b border-border/60 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`/invoices/${i.id}`)} data-testid={`invoice-row-${i.id}`}>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-700">{i.number || "DRAFT"}{i.opening_balance && <span className="ml-2 inline-block rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 font-sans" data-testid={`opening-badge-${i.id}`}>Opening Balance</span>}</td>
                  <td className="px-4 text-slate-600">{i.customer_name}</td>
                  <td className="px-4 text-slate-500">{fmtDate(i.date)}</td>
                  <td className="px-4 text-slate-500">{fmtDate(i.due_date)}</td>
                  <td className="px-4"><Badge cls="bg-blue-50 text-blue-700 border-blue-200">Z{i.zone}</Badge></td>
                  <td className="px-4 text-right font-mono text-slate-700">{fmtMoney(i.total)}</td>
                  <td className="px-4 text-right font-mono text-emerald-600">{fmtMoney(i.amount_paid)}</td>
                  <td className="px-4 text-right font-mono text-red-600">{fmtMoney(i.outstanding)}</td>
                  <td className="px-4 text-center"><Badge cls={STATUS_META[i.status]?.cls}>{STATUS_META[i.status]?.label}</Badge></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
