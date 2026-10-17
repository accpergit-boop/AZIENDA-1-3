import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtMoney, fmtDateTime, nowLocalInput } from "@/lib/format";
import { Btn, Input, Select, Textarea, Modal, Badge } from "@/components/common";
import { Route, Fuel, AlertTriangle } from "lucide-react";

export function TripPlanner({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ invoices: "", fuel_in_tank_l: "", departure: nowLocalInput(), vehicle_id: "", trailer_id: "" });
  const [cities, setCities] = useState({});
  const [km, setKm] = useState({});
  const [plan, setPlan] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [busy, setBusy] = useState("");
  useEffect(() => { if (open) api.get("/vehicles").then(setVehicles); }, [open]);

  const run = async () => {
    const nums = form.invoices.split(/[\s,;]+/).filter(Boolean);
    if (!nums.length) return toast.error("Enter at least one invoice number");
    setBusy("plan");
    try { setPlan(await api.post("/deliveries/plan", { invoice_numbers: nums, fuel_in_tank_l: Number(form.fuel_in_tank_l) || 0, departure: form.departure, vehicle_id: form.vehicle_id, trailer_id: form.trailer_id, cities })); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };
  const saveKm = async (city) => {
    const s = await api.get("/settings");
    await api.put("/settings", { city_distances: { ...(s.city_distances || {}), [city.toUpperCase()]: Number(km[city]) } });
    toast.success(`Distance saved for ${city}`); run();
  };
  const create = async () => {
    const p = plan; const first = p.stops[0];
    try {
      await api.post("/deliveries", {
        customer_id: "", customer_name: [...new Set(p.stops.map((s) => s.customer))].join(", "), destination: [...new Set(p.stops.map((s) => s.city).filter(Boolean))].join(" → "),
        size: p.total_pieces > 150 ? "large" : p.total_pieces > 50 ? "medium" : "small", vehicle_id: p.vehicle?.id || "", planned_departure: form.departure,
        products: p.stops.map((s) => `${s.invoice} ${s.customer}: ${s.items.map((i) => `${i.qty} x ${[i.category, i.size].filter(Boolean).join(" ") || i.description}`).join(", ")}`).join("\n"),
        notes: `Trip plan: ${p.route_km ?? "?"} km round trip · ${p.total_pieces} pcs${p.trailer ? ` · trailer ${p.trailer.name}` : ""}${p.fuel ? ` · diesel to give ${p.fuel.to_give_l} L${p.fuel.cost ? ` (${fmtMoney(p.fuel.cost)})` : ""}` : ""}${p.timing ? ` · return ETA ${fmtDateTime(p.timing.return_eta)}` : ""} (estimates)`,
        items: [], status: "Planned", ...(first ? {} : {}),
      });
      toast.success("Delivery created"); onCreated?.(); onClose();
    } catch (e) { toast.error(apiError(e)); }
  };
  const trucks = vehicles.filter((v) => v.vtype !== "Trailer"), trailers = vehicles.filter((v) => v.vtype === "Trailer");

  return (
    <Modal open={open} onClose={onClose} title="Smart Delivery Planner" wide>
      <div className="space-y-4">
        <Textarea label="Invoice numbers (one or more, e.g. IQF-2026-0001, IQF-2026-0002)" rows={2} value={form.invoices} onChange={(e) => setForm({ ...form, invoices: e.target.value })} data-testid="planner-invoices-input" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input label="Diesel already in tank (L)" type="number" value={form.fuel_in_tank_l} onChange={(e) => setForm({ ...form, fuel_in_tank_l: e.target.value })} data-testid="planner-tank-input" />
          <Input label="Departure" type="datetime-local" value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })} />
          <Select label="Truck" value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} data-testid="planner-truck-select"><option value="">Suggest for me</option>{trucks.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
          <Select label="Trailer" value={form.trailer_id} onChange={(e) => setForm({ ...form, trailer_id: e.target.value })} data-testid="planner-trailer-select"><option value="">Suggest if needed</option>{trailers.map((v) => <option key={v.id} value={v.id}>{v.name} {v.length}</option>)}</Select>
        </div>
        <div className="flex gap-2"><Btn disabled={!!busy} onClick={run} data-testid="planner-run-btn"><Route size={16} /> {busy === "plan" ? "Planning..." : "Plan trip"}</Btn></div>
        {plan && <div className="space-y-3" data-testid="planner-result">
          {[...plan.missing, ...plan.warnings].map((m) => <p key={m} className="text-xs text-amber-700 flex gap-1"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> {m}</p>)}
          <table className="w-full text-sm border border-border rounded"><thead><tr className="bg-slate-50 text-xs text-slate-500 text-left"><th className="p-2">Invoice</th><th>Customer</th><th>City</th><th className="text-right">Km</th><th className="text-right p-2">Pieces</th></tr></thead>
            <tbody>{plan.stops.map((s) => <tr key={s.invoice} className="border-t border-border">
              <td className="p-2 font-mono">{s.invoice}</td><td>{s.customer}</td>
              <td>{s.city ? <>{s.city}{s.city_guessed && <Badge cls="ml-1 bg-amber-50 text-amber-700 border-amber-200">guessed</Badge>}</> :
                <input placeholder="Enter city" className="border border-input rounded px-2 py-1 text-xs w-28" onBlur={(e) => setCities({ ...cities, [s.invoice]: e.target.value })} data-testid={`planner-city-${s.invoice}`} />}</td>
              <td className="text-right">{s.distance_km ?? (s.city ? <span className="inline-flex gap-1"><input type="number" className="border border-input rounded px-1 py-0.5 text-xs w-16" onChange={(e) => setKm({ ...km, [s.city]: e.target.value })} /><button className="text-primary text-xs" onClick={() => saveKm(s.city)}>Save</button></span> : "-")}</td>
              <td className="text-right p-2 font-mono">{s.pieces}</td></tr>)}</tbody></table>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3"><p className="text-xs text-slate-400">Truck</p><p className="font-bold">{plan.vehicle?.name || "-"}</p><p className="text-xs text-slate-500">{plan.vehicle?.capacity}</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-xs text-slate-400">Trailer</p><p className="font-bold">{plan.trailer ? `${plan.trailer.name} ${plan.trailer.length}` : "Not needed"}</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-xs text-slate-400">Load</p><p className="font-bold">{plan.total_pieces} pcs</p><p className="text-xs text-slate-500">{plan.total_kg != null ? `${plan.total_kg} kg` : "weight not configured"}</p></div>
            <div className="rounded-lg border border-border p-3"><p className="text-xs text-slate-400">Round trip</p><p className="font-bold">{plan.route_km ?? "?"} km</p></div>
          </div>
          {plan.fuel && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm" data-testid="planner-fuel"><p className="font-bold flex items-center gap-1"><Fuel size={15} /> Diesel</p>
            <p>Needed {plan.fuel.needed_l} L ({plan.fuel.consumption_l_100km} L/100km, +10% reserve) · in tank {plan.fuel.in_tank_l} L · <b>give driver {plan.fuel.to_give_l} L</b>{plan.fuel.cost != null ? <> · <b>{fmtMoney(plan.fuel.cost)}</b> at R {plan.fuel.price_per_l}/L{plan.fuel.price_date ? ` (${plan.fuel.price_date})` : ""}</> : ""}</p></div>}
          {plan.timing && <p className="text-sm">Driving {plan.timing.drive_hours} h + offloading {plan.timing.offload_hours} h → <b>estimated return {fmtDateTime(plan.timing.return_eta)}</b></p>}
          <p className="text-[11px] text-slate-400">{plan.note}. Distances from Kokstad are editable estimates.</p>
          <div className="flex justify-end"><Btn onClick={create} disabled={!plan.stops.length} data-testid="planner-create-btn">Create delivery from plan</Btn></div>
        </div>}
      </div>
    </Modal>
  );
}
