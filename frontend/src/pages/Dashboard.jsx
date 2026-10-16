import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { fmtMoney, fmtDate, STATUS_META } from "@/lib/format";
import { Card, Badge } from "@/components/common";
import {
  Receipt, Wallet, AlertTriangle, Boxes, Plus, UserPlus, CreditCard,
  PackagePlus, Factory, CalendarCheck, Truck, TrendingUp, Scissors, ArrowRight, Banknote, ClipboardList, Wrench,
} from "lucide-react";

const QUICK = [
  { label: "Create Invoice", icon: Plus, to: "/invoices/new" },
  { label: "Add Customer", icon: UserPlus, to: "/customers?add=1" },
  { label: "Record Payment", icon: CreditCard, to: "/invoices" },
  { label: "Update Stock", icon: PackagePlus, to: "/stock" },
  { label: "Production Record", icon: Factory, to: "/production?add=1" },
  { label: "Record Attendance", icon: CalendarCheck, to: "/attendance" },
  { label: "Create Delivery", icon: Truck, to: "/deliveries?add=1" },
];

function KPI({ title, value, icon: Icon, tint, onClick }) {
  return (
    <Card className="p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={onClick} data-testid={`kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">{value}</p>
        </div>
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${tint}`}>
          <Icon size={22} />
        </div>
      </div>
    </Card>
  );
}

function Section({ title, icon: Icon, children, action }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 font-display">
          {Icon && <Icon size={18} className="text-primary" />} {title}
        </h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const nav = useNavigate();

  useEffect(() => { api.get("/dashboard").then(setD).catch(() => {}); }, []);

  if (!d) return <div className="text-slate-400">Loading dashboard...</div>;

  const empty = (t) => <p className="text-sm text-slate-400 py-3">{t}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Overview of your business performance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI title="Total Invoiced" value={fmtMoney(d.total_invoiced)} icon={Receipt} tint="bg-blue-50 text-blue-600" onClick={() => nav("/invoices")} />
        <KPI title="Payments Received" value={fmtMoney(d.payments_received)} icon={Wallet} tint="bg-emerald-50 text-emerald-600" onClick={() => nav("/invoices")} />
        <KPI title="Outstanding Balances" value={fmtMoney(d.outstanding)} icon={AlertTriangle} tint="bg-red-50 text-red-600" onClick={() => nav("/invoices")} />
        <KPI title="Finished Stock" value={d.finished_stock} icon={Boxes} tint="bg-amber-50 text-amber-600" onClick={() => nav("/stock")} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI title="Week Revenue" value={fmtMoney(d.week_profit?.revenue)} icon={TrendingUp} tint="bg-emerald-50 text-emerald-600" onClick={() => nav("/expenses")} />
        <KPI title="Week Expenses" value={fmtMoney(d.week_profit?.expenses)} icon={Banknote} tint="bg-orange-50 text-orange-600" onClick={() => nav("/expenses")} />
        <KPI title="Week Profit" value={fmtMoney(d.week_profit?.profit)} icon={Wallet} tint={d.week_profit?.profit < 0 ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"} onClick={() => nav("/expenses")} />
      </div>

      {/* Quick actions */}
      <Card className="p-5">
        <h3 className="font-bold text-slate-800 mb-4 font-display">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {QUICK.map((q) => (
            <button key={q.label} onClick={() => nav(q.to)} data-testid={`quick-${q.label.toLowerCase().replace(/\s/g, "-")}`}
              className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 hover:border-primary hover:bg-accent/40 transition-colors">
              <q.icon size={20} className="text-primary" />
              <span className="text-xs font-semibold text-slate-600 text-center">{q.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Orders to Send" icon={ClipboardList} action={<button onClick={() => nav("/orders")} className="text-xs font-semibold text-primary flex items-center gap-1" data-testid="dash-orders-view">View <ArrowRight size={12} /></button>}>
          {d.orders_to_send?.length ? (
            <div className="space-y-2">{d.orders_to_send.map((o) => (
              <div key={o.id} className="flex justify-between rounded-lg border border-border px-3 py-2" data-testid={`dash-order-${o.id}`}>
                <span className="text-sm font-semibold text-slate-700">{o.customer_name || "-"} <span className="text-slate-400 font-normal">· {o.destination}</span></span>
                <Badge cls={o.priority === "Urgent" || o.priority === "High" ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-100 text-slate-600 border-slate-200"}>{o.priority} · {o.status}</Badge>
              </div>))}</div>
          ) : empty("No orders waiting to be sent.")}
        </Section>

        <Section title="Fleet" icon={Wrench} action={<button onClick={() => nav("/fleet")} className="text-xs font-semibold text-primary flex items-center gap-1">View <ArrowRight size={12} /></button>}>
          <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-100 px-3 py-3">
            <span className="text-sm font-semibold text-slate-700">Spare parts to buy</span>
            <Badge cls="bg-amber-100 text-amber-700 border-amber-200" data-testid="dash-parts-to-buy">{d.parts_to_buy_count || 0}</Badge>
          </div>
        </Section>

        <Section title="Low Stock Alerts" icon={AlertTriangle}>
          {d.low_stock.length === 0 ? empty("All stock above threshold.") : (
            <div className="space-y-2">
              {d.low_stock.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-700">{s.product} <span className="text-slate-400 font-normal">· {s.size}</span></span>
                  <Badge cls="bg-red-100 text-red-700 border-red-200">{s.current} left</Badge>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Production Recommendations" icon={TrendingUp}>
          {d.recommendations.length === 0 ? empty("No production needed right now.") : (
            <div className="space-y-2">
              {d.recommendations.map((r, i) => (
                <div key={i} className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                  <div className="flex justify-between"><span className="text-sm font-semibold text-slate-700">{r.product} · {r.size}</span><Badge cls="bg-amber-100 text-amber-700 border-amber-200">Make {r.recommend_qty}</Badge></div>
                  <p className="text-xs text-slate-500 mt-0.5">{r.reason}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Foam Blocks Ready for Cutting" icon={Scissors}>
          {d.ready_cutting.length === 0 ? empty("No blocks ready for cutting.") : (
            <div className="space-y-2">{d.ready_cutting.map((p) => (
              <div key={p.id} className="flex justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">{p.block_ref}</span><span className="text-xs text-slate-500">{fmtDate(p.production_date)}</span>
              </div>))}</div>
          )}
        </Section>

        <Section title="Today's Attendance" icon={CalendarCheck} action={<button onClick={() => nav("/attendance")} className="text-xs font-semibold text-primary flex items-center gap-1">View <ArrowRight size={12} /></button>}>
          {d.attendance_today.length === 0 ? empty("No attendance recorded today.") : (
            <div className="space-y-2">{d.attendance_today.map((a) => (
              <div key={a.id} className="flex justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">{a.employee_name}</span><Badge cls="bg-slate-100 text-slate-600 border-slate-200">{a.status}</Badge>
              </div>))}</div>
          )}
        </Section>

        <Section title="Upcoming Deliveries" icon={Truck} action={<button onClick={() => nav("/deliveries")} className="text-xs font-semibold text-primary flex items-center gap-1">View <ArrowRight size={12} /></button>}>
          {d.upcoming_deliveries.length === 0 ? empty("No upcoming deliveries.") : (
            <div className="space-y-2">{d.upcoming_deliveries.map((x) => (
              <div key={x.id} className="flex justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">{x.reference} <span className="text-slate-400 font-normal">· {x.customer_name || x.destination}</span></span><Badge cls="bg-blue-50 text-blue-700 border-blue-200">{x.status}</Badge>
              </div>))}</div>
          )}
        </Section>

        <Section title="Current Finished Stock" icon={Boxes} action={<button onClick={() => nav("/stock")} className="text-xs font-semibold text-primary flex items-center gap-1">View <ArrowRight size={12} /></button>}>
          <div className="space-y-2">{d.current_stock.map((s) => (
            <div key={s.id} className="flex justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-sm font-semibold text-slate-700">{s.product} <span className="text-slate-400 font-normal">· {s.size}</span></span>
              <span className={`text-sm font-mono font-bold ${s.current <= s.threshold ? "text-red-600" : "text-slate-700"}`}>{s.current}</span>
            </div>))}</div>
        </Section>
      </div>

      <Section title="Recent Invoices" icon={Receipt} action={<button onClick={() => nav("/invoices")} className="text-xs font-semibold text-primary flex items-center gap-1">View all <ArrowRight size={12} /></button>}>
        {d.recent_invoices.length === 0 ? empty("No invoices yet. Create your first invoice.") : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-border">
                <th className="py-2 font-semibold">Invoice</th><th className="font-semibold">Customer</th><th className="font-semibold">Date</th><th className="font-semibold text-right">Total</th><th className="font-semibold text-right">Balance</th><th className="font-semibold text-center">Status</th>
              </tr></thead>
              <tbody>{d.recent_invoices.map((i) => (
                <tr key={i.id} className="border-b border-border/60 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`/invoices/${i.id}`)}>
                  <td className="py-2.5 font-mono font-semibold text-slate-700">{i.number || "DRAFT"}</td>
                  <td className="text-slate-600">{i.customer_name}</td>
                  <td className="text-slate-500">{fmtDate(i.date)}</td>
                  <td className="text-right font-mono text-slate-700">{fmtMoney(i.total)}</td>
                  <td className="text-right font-mono text-slate-700">{fmtMoney(i.outstanding)}</td>
                  <td className="text-center"><Badge cls={STATUS_META[i.status]?.cls}>{STATUS_META[i.status]?.label}</Badge></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
