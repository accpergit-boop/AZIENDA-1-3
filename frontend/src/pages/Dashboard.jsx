import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { api, apiError } from "@/lib/api";
import { fmtMoney, fmtDate, fmtDateTime, STATUS_META } from "@/lib/format";
import { Card, Badge, Btn, Input, Modal } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import {
  Receipt, Wallet, AlertTriangle, Boxes, Plus, UserPlus, CreditCard,
  PackagePlus, Factory, CalendarCheck, Truck, TrendingUp, Scissors, ArrowRight, Banknote, ClipboardList, Wrench, Fuel, Pencil,
} from "lucide-react";

const QUICK = [
  { label: "Create Invoice", icon: Plus, to: "/invoices/new" },
  { label: "Add Customer", icon: UserPlus, to: "/customers?add=1" },
  { label: "Record Payment", icon: CreditCard, to: "/invoices" },
  { label: "Update Stock", icon: PackagePlus, to: "/stock" },
  { label: "Production Record", icon: Factory, to: "/production?add=1" },
  { label: "Record Attendance", icon: CalendarCheck, to: "/attendance" },
  { label: "Create Delivery", icon: Truck, to: "/deliveries?add=1" },
  { label: "Create Order", icon: ClipboardList, to: "/orders" },
  { label: "Record Expense", icon: Banknote, to: "/expenses" },
];

function KPI({ title, value, icon: Icon, tint, onClick }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }} whileTap={reduceMotion ? undefined : { scale: 0.995 }} transition={{ type: "spring", stiffness: 460, damping: 24, mass: 0.6 }}>
      <Card className="premium-card group p-5 cursor-pointer border-l-2 border-l-transparent hover:border-l-primary hover:shadow-md transition-all" onClick={onClick} data-testid={`kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.13em]">{title}</p>
            <p className="text-2xl font-semibold text-slate-900 mt-2 font-mono tabular-nums">{value}</p>
          </div>
          <div className={`h-10 w-10 rounded-md flex items-center justify-center transition-transform group-hover:translate-y-[-2px] ${tint}`}>
            <Icon size={19} strokeWidth={1.8} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function Section({ title, icon: Icon, children, action }) {
  return (
    <motion.div whileHover={{ y: -1 }} transition={{ type: "spring", stiffness: 420, damping: 26, mass: 0.55 }}>
      <Card className="premium-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 font-display text-lg">
            {Icon && <Icon size={17} strokeWidth={1.8} className="text-primary" />} {title}
          </h3>
          {action}
        </div>
        {children}
      </Card>
    </motion.div>
  );
}

function SkeletonBlock({ className = "" }) {
  return <span className={`dashboard-skeleton-bar block rounded-md ${className}`} aria-hidden="true" />;
}

function DashboardSkeleton() {
  const cards = (count, className = "") => Array.from({ length: count }, (_, index) => (
    <div key={index} className={`luxury-card rounded-lg border border-border bg-white p-5 ${className}`}>
      <SkeletonBlock className="h-2.5 w-24" />
      <SkeletonBlock className="mt-4 h-6 w-32" />
    </div>
  ));

  return (
    <div className="dashboard-loading space-y-6" role="status" aria-live="polite" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-3">
        <SkeletonBlock className="h-2.5 w-36" />
        <SkeletonBlock className="h-9 w-64 max-w-full" />
        <SkeletonBlock className="h-3 w-72 max-w-full" />
      </div>
      <div className="luxury-card rounded-lg border border-border bg-white p-5">
        <SkeletonBlock className="h-2.5 w-40" />
        <SkeletonBlock className="mt-4 h-8 w-44" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards(4)}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards(4)}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{cards(3)}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">{cards(8, "!p-3")}</div>
      <div className="luxury-card rounded-lg border border-border bg-white p-5">
        <SkeletonBlock className="mb-5 h-4 w-32" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="flex flex-col items-center gap-2 rounded-lg border border-border bg-white/70 p-4">
              <SkeletonBlock className="h-5 w-5 rounded-full" />
              <SkeletonBlock className="h-3 w-20 max-w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">{cards(6)}</div>
    </div>
  );
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [dieselModal, setDieselModal] = useState(false);
  const [dieselPrice, setDieselPrice] = useState("");
  const [dieselSaving, setDieselSaving] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();

  useEffect(() => { api.get("/dashboard").then(setD).catch(() => {}); }, []);

  const saveDieselPrice = async () => {
    const price = Number(dieselPrice);
    if (!Number.isFinite(price) || price <= 0) return toast.error("Enter a valid diesel price");
    setDieselSaving(true);
    try {
      const saved = await api.put("/settings/diesel", { price_per_l: price });
      setD((current) => ({ ...current, diesel_price: saved.diesel_price, diesel_price_date: saved.diesel_price_date,
        diesel_updated_at: saved.diesel_updated_at, diesel_sources: saved.diesel_sources, diesel_price_current: true }));
      setDieselModal(false);
      toast.success("Diesel price updated");
    } catch (e) { toast.error(apiError(e)); } finally { setDieselSaving(false); }
  };

  if (!d) return <DashboardSkeleton />;

  const empty = (t) => <p className="text-sm text-slate-400 py-3">{t}</p>;

  return (
    <div className="dashboard-stagger space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{user?.name || "Company"} · Operations</p>
        <h1 className="text-3xl sm:text-4xl font-normal text-slate-900 font-display mt-1">Business overview</h1>
        <p className="text-sm text-slate-500 mt-1">Performance, cash flow and daily operations</p>
      </div>

      <section className="luxury-card rounded-lg border border-[hsl(42_31%_74%)] bg-[hsl(68_28%_91%)] px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="dashboard-diesel-price">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Diesel 50ppm · Kokstad zone</p>
          <p className="mt-1 text-3xl font-semibold font-mono tabular-nums text-slate-900">{d.diesel_price_current ? `R ${Number(d.diesel_price).toFixed(2)}/L` : "Current price unavailable"}</p>
          {!d.diesel_price_current && d.diesel_price != null && <p className="text-sm font-semibold text-amber-800 mt-1">Last saved: R {Number(d.diesel_price).toFixed(2)}/L · OUTDATED</p>}
          {d.diesel_updated_at && <p className="text-xs text-slate-600 mt-1">Updated {fmtDateTime(d.diesel_updated_at)}</p>}
        </div>
        <div className="flex items-center gap-4">
          {d.diesel_sources?.[0] && <a href={d.diesel_sources[0]} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary underline underline-offset-4">View price source</a>}
          <Btn variant="outline" onClick={() => { setDieselPrice(d.diesel_price == null ? "" : String(d.diesel_price)); setDieselModal(true); }} data-testid="change-diesel-price-btn"><Pencil size={15} /> Change price</Btn>
        </div>
      </section>

      <Modal open={dieselModal} onClose={() => setDieselModal(false)} title="Change Diesel Price">
        <div className="space-y-4">
          <Input label="Diesel price per litre (R)" type="number" min="0" step="0.01" value={dieselPrice} onChange={(e) => setDieselPrice(e.target.value)} data-testid="dashboard-diesel-price-input" />
          <p className="text-xs text-slate-500">Check the current Kokstad price at <a href="https://petrolprices.co.za/" target="_blank" rel="noreferrer" className="font-semibold text-primary underline">PetrolPrices.co.za</a>.</p>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setDieselModal(false)}>Cancel</Btn>
            <Btn onClick={saveDieselPrice} disabled={dieselSaving} data-testid="save-dashboard-diesel-price-btn">{dieselSaving ? "Saving..." : "Save price"}</Btn>
          </div>
        </div>
      </Modal>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI title="Payments Received" value={fmtMoney(d.payments_received)} icon={Wallet} tint="bg-emerald-50 text-emerald-600" onClick={() => nav("/invoices")} />
        <KPI title="Total Invoiced" value={fmtMoney(d.total_invoiced)} icon={Receipt} tint="bg-blue-50 text-blue-600" onClick={() => nav("/invoices")} />
        <KPI title="Outstanding Balances" value={fmtMoney(d.outstanding)} icon={AlertTriangle} tint="bg-red-50 text-red-600" onClick={() => nav("/invoices")} />
        <KPI title="Finished Stock" value={d.finished_stock} icon={Boxes} tint="bg-amber-50 text-amber-600" onClick={() => nav("/stock")} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI title="Overdue Balances" value={fmtMoney(d.overdue)} icon={AlertTriangle} tint="bg-red-50 text-red-700" onClick={() => nav("/invoices")} />
        <KPI title="Revenue This Month" value={fmtMoney(d.month_profit?.revenue)} icon={TrendingUp} tint="bg-emerald-50 text-emerald-600" onClick={() => nav("/expenses")} />
        <KPI title="Expenses This Month" value={fmtMoney(d.month_profit?.expenses)} icon={Banknote} tint="bg-orange-50 text-orange-600" onClick={() => nav("/expenses")} />
        <KPI title="Est. Result This Month" value={fmtMoney(d.month_profit?.profit)} icon={Wallet} tint={d.month_profit?.profit < 0 ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"} onClick={() => nav("/expenses")} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI title="Revenue This Week" value={fmtMoney(d.week_profit?.revenue)} icon={TrendingUp} tint="bg-emerald-50 text-emerald-600" onClick={() => nav("/expenses")} />
        <KPI title="Expenses This Week" value={fmtMoney(d.week_profit?.expenses)} icon={Banknote} tint="bg-orange-50 text-orange-600" onClick={() => nav("/expenses")} />
        <KPI title="Est. Result This Week" value={fmtMoney(d.week_profit?.profit)} icon={Wallet} tint={d.week_profit?.profit < 0 ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"} onClick={() => nav("/expenses")} />
      </div>
      <p className="text-xs text-slate-400 -mt-3">Revenue = payments actually received. Estimated result = payments − recorded expenses (incomplete cost data, not accounting profit). Weeks start Monday · Africa/Johannesburg.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {[["Resting", d.resting.length, "/production"], ["Ready to Cut", d.ready_cutting.length, "/production"], ["Done Today", d.completed_today, "/production"],
          ["Orders to Send", d.orders_open_count, "/orders"], ["Urgent Orders", d.urgent_orders, "/orders"], ["Vehicles Free", `${d.vehicles_available}/${d.vehicles_total}`, "/fleet"],
          ["Parts to Buy", d.parts_to_buy_count, "/fleet"], ["Maintenance Due", d.maintenance_due, "/fleet"]].map(([l, v, to]) => (
          <motion.button key={l} whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: 0.99 }} transition={{ type: "spring", stiffness: 420, damping: 24, mass: 0.5 }} onClick={() => nav(to)} className="premium-button rounded-lg border border-border bg-white/85 p-3 text-left hover:border-primary/50 hover:bg-white transition-colors" data-testid={`op-kpi-${l.toLowerCase().replace(/\s/g, "-")}`}>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{l}</p><p className="text-xl font-semibold font-mono tabular-nums text-slate-800 mt-1">{v}</p>
          </motion.button>))}
      </div>

      {/* Quick actions */}
      <Card className="premium-card p-5">
        <h3 className="font-bold text-slate-800 mb-4 font-display">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {QUICK.map((q) => (
            <motion.button key={q.label} whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: 0.985 }} transition={{ type: "spring", stiffness: 430, damping: 24, mass: 0.5 }} onClick={() => nav(q.to)} data-testid={`quick-${q.label.toLowerCase().replace(/\s/g, "-")}`}
              className="premium-button flex flex-col items-center gap-2 rounded-lg border border-border bg-white/70 p-4 hover:border-primary/50 hover:bg-accent/35 transition-colors">
              <q.icon size={19} strokeWidth={1.8} className="text-primary" />
              <span className="text-xs font-semibold text-slate-700 text-center">{q.label}</span>
            </motion.button>
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
