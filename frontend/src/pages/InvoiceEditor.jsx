import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { api, apiError } from "@/lib/api";
import { fmtMoney, fmtDate, today, newKey, STATUS_META } from "@/lib/format";
import { Card, Btn, Input, Select, Textarea, Badge, Modal } from "@/components/common";
import { Copy, Download, Save, Send, CreditCard, Plus, Trash2, ArrowLeft, Ban, Printer, AlertTriangle } from "lucide-react";

const CATS = {
  1: ["Standard", "Ribbon", "Candy", "Strong Boy", "Uncovered"],
  2: ["Standard", "Ribbon Black & Pink", "Candy", "Strong Boy", "Uncovered Blue 16 Density"],
};
const RIBBON = ["Ribbon", "Ribbon Black & Pink", "Candy"];
const priceCat = (zone, cat) => (cat === "Candy" ? (zone === 1 ? "Ribbon" : "Ribbon Black & Pink") : cat);
const manualOnly = (cat, size) => RIBBON.includes(cat) && size === "1370x150";

const emptyItem = () => ({ qty: 1, category: "Standard", size: "", description: "", unit_price: 0, price_override: false, tax: false, _needsConfig: false });

export default function InvoiceEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [prices, setPrices] = useState([]);
  const [settings, setSettings] = useState({});
  const [inv, setInv] = useState({
    customer_id: "", customer_name: "", date: today(), due_date: today(), zone: 1,
    payment_terms: "Due on Delivery", reference: "", notes: "", items: [emptyItem()],
    discount: 0, extra_charges: 0, tax_enabled: false, tax_rate: 15, status: "draft",
    amount_paid: 0, number: null,
  });
  const [payRecords, setPayRecords] = useState([]);
  const [payModal, setPayModal] = useState(null);
  const [nextNum, setNextNum] = useState("");

  useEffect(() => {
    Promise.all([api.get("/customers"), api.get("/prices"), api.get("/settings")]).then(([c, p, s]) => {
      setCustomers(c); setPrices(p); setSettings(s);
      setInv((prev) => ({ ...prev, tax_enabled: s.tax_enabled, tax_rate: s.tax_rate }));
    });
    if (id) api.get(`/invoices/${id}`).then((d) => { setInv(d); setPayRecords(d.payment_records || []); });
    else api.get("/invoices/next-number").then((d) => setNextNum(d.number));
  }, [id]);

  const sizesFor = (zone, cat) => prices.filter((p) => p.zone === zone && p.category === priceCat(zone, cat) && p.active).map((p) => p.size);

  const lookupPrice = (zone, cat, size) => {
    if (manualOnly(cat, size)) return { price: null, needsConfig: true };
    const p = prices.find((x) => x.zone === zone && x.category === priceCat(zone, cat) && x.size === size && x.active);
    if (!p) return { price: null, needsConfig: false, missing: true };
    if (p.price == null || !p.confirmed) return { price: null, needsConfig: true };
    return { price: p.price, needsConfig: false };
  };

  const updateItem = (idx, patch) => {
    setInv((prev) => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], ...patch };
      return { ...prev, items };
    });
  };

  const onCatSize = (idx, patch) => {
    const it = { ...inv.items[idx], ...patch };
    patch.price_override = false;
    if (it.category && it.size) {
      const r = lookupPrice(inv.zone, it.category, it.size);
      patch.unit_price = r.price ?? 0;
      patch._needsConfig = r.needsConfig || r.missing;
    } else { patch.unit_price = 0; patch._needsConfig = false; }
    updateItem(idx, patch);
  };

  const repriceItems = (items, zone) => items.map((it) => {
    if (it.price_override) return it;
    const cats = CATS[zone];
    const cat = cats.includes(it.category) ? it.category : cats[0];
    const r = lookupPrice(zone, cat, it.size);
    return { ...it, category: cat, unit_price: r.price ?? 0, _needsConfig: !!it.size && (r.needsConfig || r.missing) };
  });

  const confirmReprice = (items, next) => {
    const changes = items.map((it, i) => ({ it, n: next[i] })).filter(({ it, n }) => it.size && Number(it.unit_price) !== Number(n.unit_price));
    if (!changes.length) return true;
    const kept = items.filter((it) => it.price_override && it.size).length;
    return window.confirm(`Apply new zone prices?\n\n${changes.map(({ it, n }) => `${it.category} ${it.size}: ${fmtMoney(it.unit_price)} → ${n._needsConfig ? "needs confirmation" : fmtMoney(n.unit_price)}`).join("\n")}${kept ? `\n\n${kept} manual price(s) will be kept.` : ""}`);
  };

  const changeZone = (zone) => {
    const next = repriceItems(inv.items, zone);
    if (!confirmReprice(inv.items, next)) return;
    setInv({ ...inv, zone, items: next });
  };

  const selectCustomer = (cid) => {
    const c = customers.find((x) => x.id === cid);
    if (!c) { setInv((prev) => ({ ...prev, customer_id: "", customer_name: "" })); return; }
    const zone = c.default_zone;
    let items = inv.items;
    if (zone !== inv.zone) {
      const next = repriceItems(inv.items, zone);
      if (confirmReprice(inv.items, next)) items = next;
    }
    setInv({ ...inv, customer_id: cid, customer_name: c.name, payment_terms: c.payment_terms, zone: items === inv.items ? inv.zone : zone, items, destination: inv.destination || c.city || "" });
    if (!c.city) toast.info("This customer has no saved city. Please confirm the delivery destination.");
  };

  const totals = useMemo(() => {
    const subtotal = inv.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
    const taxed = Math.max(subtotal - Number(inv.discount || 0) + Number(inv.extra_charges || 0), 0);
    const tax = inv.tax_enabled ? taxed * (Number(inv.tax_rate) || 0) / 100 : 0;
    const total = taxed + tax;
    const outstanding = total - Number(inv.amount_paid || 0);
    return { subtotal, tax, total, outstanding };
  }, [inv]);

  const hasConfigIssue = inv.items.some((it) => it._needsConfig && it.size && !(it.price_override && Number(it.unit_price) > 0));
  const [busy, setBusy] = useState(false);

  const buildPayload = (status) => ({
    customer_id: inv.customer_id, customer_name: inv.customer_name, date: inv.date,
    due_date: inv.due_date, zone: inv.zone, payment_terms: inv.payment_terms,
    reference: inv.reference, notes: inv.notes, destination: inv.destination || "",
    items: inv.items.filter((it) => it.size || it.description).map((it) => ({
      qty: Number(it.qty) || 0, category: it.category, size: it.size, description: it.description,
      unit_price: Number(it.unit_price) || 0, price_override: it.price_override, tax: it.tax,
    })),
    discount: Number(inv.discount) || 0, extra_charges: Number(inv.extra_charges) || 0,
    tax_enabled: inv.tax_enabled, tax_rate: Number(inv.tax_rate) || 0, status,
  });

  const validate = (status) => {
    if (!inv.customer_id) { toast.error("Select a customer"); return false; }
    if (!inv.items.some((it) => it.size || it.description)) { toast.error("Add at least one item"); return false; }
    if (inv.items.some((it) => (Number(it.qty) || 0) <= 0 && (it.size || it.description))) { toast.error("Quantity must be positive"); return false; }
    if (status !== "draft" && hasConfigIssue) { toast.error("Some items require administrator confirmation. Enter a manual price before issuing."); return false; }
    return true;
  };

  const save = async (status) => {
    if (!validate(status) || busy) return;
    setBusy(true);
    try {
      const payload = buildPayload(status);
      const res = id ? await api.put(`/invoices/${id}`, payload) : await api.post("/invoices", payload);
      toast.success(status === "draft" ? "Saved as draft" : "Invoice saved");
      nav(`/invoices/${res.id}`);
      if (id) { setInv(res); }
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const issueExisting = async () => {
    try { const res = await api.post(`/invoices/${id}/issue`); setInv(res); toast.success("Invoice issued"); }
    catch (e) { toast.error(apiError(e)); }
  };

  const voidInvoice = async () => {
    const reason = window.prompt("Reason for voiding this invoice (required):");
    if (reason === null) return;
    if (!reason.trim()) return toast.error("A reason is required to void an invoice");
    try { const res = await api.post(`/invoices/${id}/void`, { reason }); setInv({ ...inv, status: res.status, void_reason: reason }); toast.success("Invoice voided"); }
    catch (e) { toast.error(apiError(e)); }
  };

  const deleteDraft = async () => {
    if (!window.confirm("Delete this draft invoice permanently?")) return;
    try { await api.del(`/invoices/${id}`); toast.success("Draft deleted"); nav("/invoices"); }
    catch (e) { toast.error(apiError(e)); }
  };

  const reloadInv = async () => { const d = await api.get(`/invoices/${id}`); setInv(d); setPayRecords(d.payment_records || []); };

  const recordPayment = async () => {
    if (busy) return;
    if (!(Number(payModal.amount) > 0)) return toast.error("Amount must be greater than 0");
    setBusy(true);
    try {
      await api.post(`/invoices/${id}/payments`, { ...payModal, amount: Number(payModal.amount) });
      await reloadInv(); setPayModal(null);
      toast.success("Payment recorded");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const reversePayment = async (p) => {
    const reason = window.prompt(`Reverse payment of ${fmtMoney(p.amount)}? Enter a reason:`);
    if (reason === null) return;
    if (!reason.trim()) return toast.error("A reason is required");
    try { await api.post(`/payments/${p.id}/reverse`, { reason }); await reloadInv(); toast.success("Payment reversed"); }
    catch (e) { toast.error(apiError(e)); }
  };

  const invoiceText = () => {
    const L = [];
    L.push(settings.company_name || "SUPER IQ-FOAM");
    L.push(`INVOICE: ${inv.number || "DRAFT"}`);
    L.push("");
    L.push(`Customer: ${inv.customer_name || "-"}`);
    L.push(`Invoice Date: ${fmtDate(inv.date)}`);
    L.push(`Due Date: ${fmtDate(inv.due_date)}`);
    L.push(`Price Zone: Zone ${inv.zone}`);
    L.push(`Payment Terms: ${inv.payment_terms}`);
    if (inv.destination) L.push(`Delivery To: ${inv.destination}`);
    if (inv.reference) L.push(`Reference: ${inv.reference}`);
    L.push("");
    L.push("ITEMS");
    L.push("--------------------------------");
    inv.items.filter((it) => it.size || it.description).forEach((it) => {
      L.push(`Qty: ${it.qty}`);
      L.push(`Category: ${it.category}`);
      L.push(`Size: ${it.size || it.description}`);
      L.push(`Unit Price: ${fmtMoney(it.unit_price)}`);
      L.push(`Line Total: ${fmtMoney((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}`);
      L.push("--------------------------------");
    });
    L.push(`Subtotal: ${fmtMoney(totals.subtotal)}`);
    if (Number(inv.discount)) L.push(`Discount: ${fmtMoney(inv.discount)}`);
    if (Number(inv.extra_charges)) L.push(`Extra Charges: ${fmtMoney(inv.extra_charges)}`);
    if (inv.tax_enabled) L.push(`Tax (${inv.tax_rate}%): ${fmtMoney(totals.tax)}`);
    L.push(`Total: ${fmtMoney(totals.total)}`);
    L.push(`Amount Paid: ${fmtMoney(inv.amount_paid)}`);
    L.push(`Outstanding Balance: ${fmtMoney(totals.outstanding)}`);
    if (inv.notes) { L.push(""); L.push(`Notes: ${inv.notes}`); }
    if (settings.telephone || settings.email) {
      L.push(""); L.push([settings.telephone, settings.email].filter(Boolean).join(" | "));
    }
    return L.join("\n");
  };

  const copyInvoice = async () => {
    const text = invoiceText();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast.success("Invoice copied successfully");
      } else throw new Error("fallback");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); toast.success("Invoice copied successfully"); }
      catch { window.prompt("Copy the invoice text below:", text); }
      document.body.removeChild(ta);
    }
  };

  const downloadPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = 595.28; let y = 48; const L = 40, R = W - 40;
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(15, 23, 42);
    doc.text(settings.company_name || "SUPER IQ-FOAM", L, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 116, 139);
    let cy = y + 16;
    [settings.address, settings.telephone, settings.email].filter(Boolean).forEach((t) => { doc.text(String(t), L, cy); cy += 12; });
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(37, 99, 235);
    doc.text("INVOICE", R, y, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30, 41, 59);
    doc.text(inv.number || "DRAFT", R, y + 16, { align: "right" });

    y = Math.max(cy, y + 40) + 14;
    doc.setDrawColor(226, 232, 240); doc.line(L, y, R, y); y += 18;
    doc.setFontSize(9); doc.setTextColor(100, 116, 139);
    doc.text("BILL TO", L, y); doc.text("DETAILS", R - 180, y); y += 14;
    doc.setTextColor(30, 41, 59); doc.setFont("helvetica", "bold");
    doc.text(inv.customer_name || "-", L, y);
    doc.setFont("helvetica", "normal");
    const cust = customers.find((c) => c.id === inv.customer_id) || {};
    [cust.phone, cust.address, inv.destination && `Deliver to: ${inv.destination}`].filter(Boolean).forEach((t, k) => doc.text(String(t), L, y + 13 * (k + 1)));
    doc.text(`Date: ${fmtDate(inv.date)}`, R - 180, y);
    doc.text(`Due: ${fmtDate(inv.due_date)}`, R - 180, y + 13);
    doc.text(`Zone ${inv.zone} | ${inv.payment_terms}`, R - 180, y + 26);
    y += 40;

    // table header
    doc.setFillColor(15, 23, 42); doc.rect(L, y, R - L, 22, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("QTY", L + 8, y + 15); doc.text("DESCRIPTION", L + 50, y + 15);
    doc.text("UNIT", R - 150, y + 15, { align: "right" }); doc.text("TOTAL", R - 10, y + 15, { align: "right" });
    y += 22;
    doc.setFont("helvetica", "normal"); doc.setTextColor(30, 41, 59);
    inv.items.filter((it) => it.size || it.description).forEach((it, i) => {
      if (i % 2) { doc.setFillColor(248, 250, 252); doc.rect(L, y, R - L, 20, "F"); }
      const lt = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
      doc.text(String(it.qty), L + 8, y + 14);
      doc.text(`${it.category} ${it.size || it.description}`.trim(), L + 50, y + 14);
      doc.text(fmtMoney(it.unit_price), R - 150, y + 14, { align: "right" });
      doc.text(fmtMoney(lt), R - 10, y + 14, { align: "right" });
      y += 20;
    });
    y += 10;
    const row = (lbl, val, bold) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(bold ? 12 : 10);
      doc.text(lbl, R - 180, y); doc.text(val, R - 10, y, { align: "right" }); y += bold ? 20 : 16;
    };
    row("Subtotal", fmtMoney(totals.subtotal));
    if (Number(inv.discount)) row("Discount", "-" + fmtMoney(inv.discount));
    if (Number(inv.extra_charges)) row("Extra Charges", fmtMoney(inv.extra_charges));
    if (inv.tax_enabled) row(`Tax (${inv.tax_rate}%)`, fmtMoney(totals.tax));
    doc.setDrawColor(226, 232, 240); doc.line(R - 180, y - 6, R, y - 6);
    row("TOTAL", fmtMoney(totals.total), true);
    row("Payments Received", fmtMoney(inv.amount_paid));
    row("Balance Due", fmtMoney(totals.outstanding), true);
    if (settings.banking_details) {
      y += 14; doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Banking Details", L, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
      String(settings.banking_details).split("\n").forEach((t) => { y += 12; doc.text(t, L, y); });
    }
    doc.save(`${inv.number || "invoice"}.pdf`);
    toast.success("PDF downloaded");
  };

  const st = STATUS_META[inv.status] || STATUS_META.draft;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 no-print">
        <button onClick={() => nav("/invoices")} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={16} /> Back to Invoices
        </button>
        <div className="flex items-center gap-2">
          <Badge cls={st.cls}>{st.label}</Badge>
          <button onClick={copyInvoice} title="Copy invoice to clipboard" data-testid="copy-invoice-btn"
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-white text-slate-600 hover:text-primary hover:border-primary">
            <Copy size={17} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Invoice info */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 font-display">Invoice Information</h3>
              <span className="font-mono text-sm font-bold text-primary">{inv.number || nextNum || "DRAFT"}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Customer *" value={inv.customer_id} onChange={(e) => selectCustomer(e.target.value)} data-testid="invoice-customer-select">
                <option value="">Select customer...</option>
                {customers.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select label="Price Zone" value={inv.zone} onChange={(e) => changeZone(Number(e.target.value))} data-testid="invoice-zone-select">
                <option value={1}>Zone 1</option><option value={2}>Zone 2</option>
              </Select>
              <Input label="Invoice Date" type="date" value={inv.date} onChange={(e) => setInv({ ...inv, date: e.target.value })} />
              <Input label="Due Date" type="date" value={inv.due_date} onChange={(e) => setInv({ ...inv, due_date: e.target.value })} />
              <Select label="Payment Terms" value={inv.payment_terms} onChange={(e) => setInv({ ...inv, payment_terms: e.target.value })}>
                {(settings.payment_terms || ["Due on Delivery", "7 Days", "30 Days"]).map((t) => <option key={t}>{t}</option>)}
              </Select>
              <Input label="Reference (optional)" value={inv.reference} onChange={(e) => setInv({ ...inv, reference: e.target.value })} />
              <Input label="Delivery Destination" value={inv.destination || ""} onChange={(e) => setInv({ ...inv, destination: e.target.value })} data-testid="invoice-destination-input" />
            </div>
          </Card>

          {/* Product table */}
          <Card className="p-5">
            <h3 className="font-bold text-slate-800 mb-4 font-display">Items</h3>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[720px]">
                <thead><tr className="text-left text-xs text-slate-400 border-b border-border">
                  <th className="pb-2 font-semibold w-16">Qty</th><th className="pb-2 font-semibold">Category</th><th className="pb-2 font-semibold">Size</th><th className="pb-2 font-semibold w-32">Unit Price (R)</th><th className="pb-2 font-semibold text-right w-28">Line Total</th><th className="w-10"></th>
                </tr></thead>
                <tbody>{inv.items.map((it, idx) => (
                  <tr key={idx} className="border-b border-border/50" data-testid={`item-row-${idx}`}>
                    <td className="py-2 pr-2">
                      <input type="number" min="0" value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} data-testid={`item-qty-${idx}`}
                        className="w-16 rounded border border-input px-2 py-1.5 text-sm" />
                    </td>
                    <td className="pr-2">
                      <select value={it.category} onChange={(e) => onCatSize(idx, { category: e.target.value, size: "" })} data-testid={`item-cat-${idx}`}
                        className="w-full rounded border border-input px-2 py-1.5 text-sm min-w-[130px]">
                        {CATS[inv.zone].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="pr-2">
                      <select value={it.size} onChange={(e) => onCatSize(idx, { size: e.target.value })} data-testid={`item-size-${idx}`}
                        className="w-full rounded border border-input px-2 py-1.5 text-sm min-w-[110px]">
                        <option value="">Select...</option>
                        {sizesFor(inv.zone, it.category).map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="pr-2">
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.01" value={it.unit_price}
                          onChange={(e) => updateItem(idx, { unit_price: e.target.value, price_override: true })} data-testid={`item-price-${idx}`}
                          className={`w-24 rounded border px-2 py-1.5 text-sm font-mono ${it._needsConfig && it.size && !(it.price_override && Number(it.unit_price) > 0) ? "border-red-400 bg-red-50" : it.price_override ? "border-amber-400 bg-amber-50" : "border-input"}`} />
                        {it.price_override && <span title="Manual override" className="text-[10px] font-bold text-amber-600">M</span>}
                      </div>
                      {it._needsConfig && it.size && <span className="text-[10px] text-red-600 flex items-center gap-0.5 mt-0.5" data-testid={`item-needs-config-${idx}`}><AlertTriangle size={10} /> {manualOnly(it.category, it.size) ? "Manual price required" : "Requires administrator confirmation"}</span>}
                    </td>
                    <td className="text-right font-mono text-slate-700">{fmtMoney((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</td>
                    <td className="text-right">
                      <button onClick={() => setInv({ ...inv, items: inv.items.filter((_, i) => i !== idx) })} className="text-slate-300 hover:text-red-600 p-1" data-testid={`item-delete-${idx}`}><Trash2 size={16} /></button>
                    </td>
                  </tr>))}</tbody>
              </table>
            </div>
            <Btn variant="outline" className="mt-4" onClick={() => setInv({ ...inv, items: [...inv.items, emptyItem()] })} data-testid="add-item-btn"><Plus size={16} /> Add Item</Btn>
          </Card>

          {inv.notes !== undefined && (
            <Card className="p-5"><Textarea label="Notes (optional)" rows={2} value={inv.notes} onChange={(e) => setInv({ ...inv, notes: e.target.value })} /></Card>
          )}
        </div>

        {/* Totals + payment sidebar */}
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="font-bold text-slate-800 mb-4 font-display">Totals</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono font-semibold">{fmtMoney(totals.subtotal)}</span></div>
              <div className="flex justify-between items-center"><span className="text-slate-500">Discount</span>
                <input type="number" step="0.01" value={inv.discount} onChange={(e) => setInv({ ...inv, discount: e.target.value })} data-testid="discount-input" className="w-24 rounded border border-input px-2 py-1 text-sm font-mono text-right" /></div>
              <div className="flex justify-between items-center"><span className="text-slate-500">Extra Charges</span>
                <input type="number" step="0.01" value={inv.extra_charges} onChange={(e) => setInv({ ...inv, extra_charges: e.target.value })} className="w-24 rounded border border-input px-2 py-1 text-sm font-mono text-right" /></div>
              <label className="flex items-center justify-between"><span className="text-slate-500">Apply Tax {inv.tax_enabled ? `(${inv.tax_rate}%)` : ""}</span>
                <input type="checkbox" checked={inv.tax_enabled} onChange={(e) => setInv({ ...inv, tax_enabled: e.target.checked })} /></label>
              {inv.tax_enabled && <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="font-mono">{fmtMoney(totals.tax)}</span></div>}
              <div className="flex justify-between border-t border-border pt-3 text-base"><span className="font-bold text-slate-800">Total</span><span className="font-mono font-bold text-slate-900" data-testid="invoice-total">{fmtMoney(totals.total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Amount Paid</span><span className="font-mono text-emerald-600">{fmtMoney(inv.amount_paid)}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-slate-700">Outstanding</span><span className="font-mono font-bold text-red-600" data-testid="invoice-outstanding">{fmtMoney(totals.outstanding)}</span></div>
            </div>
          </Card>

          <Card className="p-5 space-y-2 no-print">
            <h3 className="font-bold text-slate-800 mb-3 font-display">Actions</h3>
            {inv.status === "void" ? <p className="text-sm text-slate-400" data-testid="void-reason">This invoice is voided.{inv.void_reason ? ` Reason: ${inv.void_reason}` : ""}</p> : (
              <div className="grid grid-cols-2 gap-2">
                {(!inv.number) && <Btn variant="outline" disabled={busy} onClick={() => save("draft")} data-testid="save-draft-btn"><Save size={15} /> Draft</Btn>}
                <Btn disabled={busy} onClick={() => save("issued")} data-testid="issue-invoice-btn"><Send size={15} /> {id && inv.number ? "Update" : "Issue"}</Btn>
                <Btn variant="outline" onClick={copyInvoice} data-testid="copy-btn-2"><Copy size={15} /> Copy</Btn>
                <Btn variant="outline" onClick={downloadPDF} data-testid="download-pdf-btn"><Download size={15} /> PDF</Btn>
                <Btn variant="outline" onClick={() => window.print()} data-testid="print-invoice-btn"><Printer size={15} /> Print</Btn>
                {id && inv.status !== "draft" && totals.outstanding > 0 && (
                  <Btn variant="success" onClick={() => setPayModal({ amount: totals.outstanding.toFixed(2), method: "Cash", date: today(), reference: "", notes: "", idempotency_key: newKey() })} data-testid="record-payment-btn"><CreditCard size={15} /> Pay</Btn>
                )}
                {id && inv.status === "draft" && <Btn variant="subtle" onClick={issueExisting} data-testid="issue-existing-btn"><Send size={15} /> Issue</Btn>}
                {id && inv.status === "draft" && !inv.number && <Btn variant="ghost" className="col-span-2 text-red-600" onClick={deleteDraft} data-testid="delete-draft-btn"><Trash2 size={15} /> Delete Draft</Btn>}
                {id && inv.number && <Btn variant="ghost" className="col-span-2 text-red-600" onClick={voidInvoice} data-testid="void-invoice-btn"><Ban size={15} /> Void Invoice</Btn>}
              </div>
            )}
          </Card>

          {payRecords.length > 0 && (
            <Card className="p-5 no-print">
              <h3 className="font-bold text-slate-800 mb-3 font-display">Payment History</h3>
              <div className="space-y-2">{payRecords.map((p) => (
                <div key={p.id} className={`flex items-center justify-between gap-2 text-sm border border-border rounded-lg px-3 py-2 ${p.reversed ? "opacity-60" : ""}`} data-testid={`payment-row-${p.id}`}>
                  <span className="text-slate-500">{fmtDate(p.date)} · {p.method}{p.reversed && <span className="ml-1 text-red-600 font-semibold">Reversed</span>}</span>
                  <span className={`font-mono font-semibold ${p.reversed ? "line-through text-slate-400" : "text-emerald-600"}`}>{fmtMoney(p.amount)}</span>
                  {!p.reversed && <button onClick={() => reversePayment(p)} className="text-xs text-red-500 hover:underline" data-testid={`reverse-payment-${p.id}`}>Reverse</button>}
                </div>))}</div>
            </Card>
          )}
        </div>
      </div>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Record Payment">
        {payModal && (
          <div className="space-y-4">
            <Input label="Amount (R)" type="number" step="0.01" value={payModal.amount} onChange={(e) => setPayModal({ ...payModal, amount: e.target.value })} data-testid="payment-amount-input" />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Method" value={payModal.method} onChange={(e) => setPayModal({ ...payModal, method: e.target.value })}>
                {(settings.payment_methods || ["Cash", "Bank Transfer"]).map((m) => <option key={m}>{m}</option>)}
              </Select>
              <Input label="Date" type="date" value={payModal.date} onChange={(e) => setPayModal({ ...payModal, date: e.target.value })} />
            </div>
            <Input label="Reference (optional)" value={payModal.reference} onChange={(e) => setPayModal({ ...payModal, reference: e.target.value })} />
            <Textarea label="Notes (optional)" rows={2} value={payModal.notes} onChange={(e) => setPayModal({ ...payModal, notes: e.target.value })} />
            <p className="text-xs text-slate-400">Outstanding: {fmtMoney(totals.outstanding)}. Only confirmed payments count as received.</p>
            <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setPayModal(null)}>Cancel</Btn><Btn variant="success" disabled={busy} onClick={recordPayment} data-testid="confirm-payment-btn">{busy ? "Saving..." : "Confirm Payment"}</Btn></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
