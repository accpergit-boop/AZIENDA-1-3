import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtMoney, fmtDate, today } from "@/lib/format";
import { Card, Btn, Input, Select, Badge, Modal, PageHeader, Empty } from "@/components/common";
import { Banknote, Plus, TrendingUp, TrendingDown, Wallet, Trash2, Pencil } from "lucide-react";

const CATS = ["General", "Materials", "Fuel", "Salaries", "Rent", "Utilities", "Vehicle", "Maintenance", "Other"];
const blank = () => ({ description: "", amount: "", date: today(), category: "General" });

function Stat({ label, value, icon: Icon, tone, testid }) {
  return (
    <Card className="p-5" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">{value}</p>
        </div>
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${tone}`}><Icon size={22} /></div>
      </div>
    </Card>
  );
}

function ProfitPanel({ title, p, testid }) {
  const neg = (p?.profit || 0) < 0;
  return (
    <Card className="p-5" data-testid={testid}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{title}</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Revenue (payments)</span><span className="font-mono text-emerald-700">{fmtMoney(p?.revenue)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Expenses</span><span className="font-mono text-orange-600">- {fmtMoney(p?.expenses)}</span></div>
        <div className="flex justify-between border-t border-border pt-2 mt-2"><span className="font-bold text-slate-800">Profit</span><span className={`font-mono font-bold ${neg ? "text-red-600" : "text-slate-900"}`}>{fmtMoney(p?.profit)}</span></div>
      </div>
    </Card>
  );
}

export default function Expenses() {
  const [list, setList] = useState([]);
  const [report, setReport] = useState(null);
  const [modal, setModal] = useState(null);
  const [cat, setCat] = useState("");
  const [month, setMonth] = useState("");

  const load = () => { api.get("/expenses").then(setList); api.get("/reports/profit").then(setReport); };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => list.filter((e) => (!cat || e.category === cat) && (!month || (e.date || "").startsWith(month))), [list, cat, month]);
  const filteredTotal = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  const save = async () => {
    if (!modal.description.trim()) return toast.error("Description required");
    if (!(Number(modal.amount) > 0)) return toast.error("Amount must be greater than 0");
    try {
      const payload = { ...modal, amount: Number(modal.amount) };
      if (modal.id) await api.put(`/expenses/${modal.id}`, payload);
      else await api.post("/expenses", payload);
      toast.success("Expense saved"); setModal(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (e) => {
    if (!window.confirm(`Delete expense "${e.description}"?`)) return;
    try { await api.del(`/expenses/${e.id}`); toast.success("Expense deleted"); load(); } catch (err) { toast.error(apiError(err)); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Expenses" subtitle="Daily expenses and profit overview">
        <Btn onClick={() => setModal(blank())} data-testid="add-expense-btn"><Plus size={16} /> Add Expense</Btn>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Week Profit" value={fmtMoney(report?.week.profit)} icon={Wallet} tone="bg-blue-50 text-blue-600" testid="stat-week-profit" />
        <Stat label="Month Profit" value={fmtMoney(report?.month.profit)} icon={TrendingUp} tone="bg-emerald-50 text-emerald-600" testid="stat-month-profit" />
        <Stat label="Total Expenses" value={fmtMoney(report?.total_expenses)} icon={TrendingDown} tone="bg-orange-50 text-orange-600" testid="stat-total-expenses" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProfitPanel title={`This week (from ${fmtDate(report?.week_start)})`} p={report?.week} testid="profit-week" />
        <ProfitPanel title={`This month (from ${fmtDate(report?.month_start)})`} p={report?.month} testid="profit-month" />
      </div>
      <p className="text-xs text-slate-400 -mt-3">Profit = payments received − daily expenses − vehicle expenses, repairs & maintenance.</p>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 p-4 border-b border-border">
          <div className="w-44"><Select label="Category" value={cat} onChange={(e) => setCat(e.target.value)} data-testid="expense-filter-category"><option value="">All</option>{CATS.map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div className="w-44"><Input label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="expense-filter-month" /></div>
          <div className="ml-auto text-sm text-slate-500">Filtered total: <span className="font-mono font-bold text-slate-800" data-testid="expense-filtered-total">{fmtMoney(filteredTotal)}</span></div>
        </div>
        {filtered.length === 0 ? <Empty icon={Banknote} title="No expenses recorded" hint="Add your first daily expense." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="text-left text-xs text-slate-400 bg-slate-50 border-b border-border">
                <th className="px-4 py-3 font-semibold">Date</th><th className="px-4 font-semibold">Description</th><th className="px-4 font-semibold">Category</th><th className="px-4 font-semibold text-right">Amount</th><th className="px-4 font-semibold text-right">Actions</th>
              </tr></thead>
              <tbody>{filtered.map((e) => (
                <tr key={e.id} className="border-b border-border/60 hover:bg-slate-50" data-testid={`expense-row-${e.id}`}>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(e.date)}</td>
                  <td className="px-4 font-semibold text-slate-800">{e.description}</td>
                  <td className="px-4"><Badge>{e.category}</Badge></td>
                  <td className="px-4 text-right font-mono text-slate-800">{fmtMoney(e.amount)}</td>
                  <td className="px-4 text-right whitespace-nowrap">
                    <button onClick={() => setModal({ ...e })} className="text-slate-400 hover:text-primary mr-3" data-testid={`edit-expense-${e.id}`}><Pencil size={15} /></button>
                    <button onClick={() => remove(e)} className="text-slate-400 hover:text-red-600" data-testid={`delete-expense-${e.id}`}><Trash2 size={15} /></button>
                  </td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? "Edit Expense" : "Add Expense"}>
        {modal && <div className="space-y-4">
          <Input label="Description *" value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} data-testid="expense-description-input" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (R) *" type="number" step="0.01" value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} data-testid="expense-amount-input" />
            <Input label="Date" type="date" value={modal.date} onChange={(e) => setModal({ ...modal, date: e.target.value })} data-testid="expense-date-input" />
          </div>
          <Select label="Category" value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value })} data-testid="expense-category-select">
            {CATS.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn><Btn onClick={save} data-testid="save-expense-btn">Save Expense</Btn></div>
        </div>}
      </Modal>
    </div>
  );
}
