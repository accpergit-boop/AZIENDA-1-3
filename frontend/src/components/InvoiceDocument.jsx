import { forwardRef } from "react";
import { fmtMoney, fmtDate } from "@/lib/format";
import { companyDisplayName } from "@/lib/company";

export const COMPANY = { name: "SUPER IQ-FOAM", address: ["ROCKY RIDGE LODGE", "ROCKY RIDGE FARM", "KOKSTAD, 4700"], phones: "0659279036 - 0634029112" };

const Logo = () => (
  <svg width="58" height="58" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 6 58 20 32 34 6 20Z" fill="#2563EB" /><path d="M6 20v8l26 14 26-14v-8L32 34Z" fill="#1D4ED8" />
    <path d="M6 34l26 14 26-14v8L32 56 6 42Z" fill="none" stroke="#2563EB" strokeWidth="4" strokeLinejoin="round" />
    <circle cx="24" cy="18" r="1.6" fill="#fff" /><circle cx="32" cy="22" r="1.6" fill="#fff" /><circle cx="40" cy="18" r="1.6" fill="#fff" /><circle cx="32" cy="14" r="1.6" fill="#fff" />
  </svg>
);

export const InvoiceDocument = forwardRef(function InvoiceDocument({ inv, totals, customer = {}, settings = {} }, ref) {
  const rows = (inv.items || []).filter((it) => (it.size || it.description) &&
    !(!it.category && !it.size && it.description?.trim().toLowerCase() === "opening balance"));
  const shipTo = inv.destination || customer.city || customer.address || "";
  const companyName = companyDisplayName(settings.company_name || COMPANY.name);
  const invoiceBrand = /wholesale/i.test(companyName) ? { blue: "IQ FOAM", black: "WHOLESALERS" } :
    /manufactur|manufactor/i.test(companyName) ? { blue: "IQ FOAM", black: "MANUFACTURING" } :
      /super/i.test(companyName) && /iq\s*[- ]?foam/i.test(companyName) ? { blue: "SUPER", black: "IQFOAM" } :
        /iq\s*[- ]?foam/i.test(companyName) ? { blue: "IQFOAM", black: "" } : { blue: "", black: companyName };
  const L = ({ k, v }) => (v ? <p className="leading-7"><span className="font-semibold text-slate-900">{k}</span> <span className="text-slate-800">{v}</span></p> : null);
  return (
    <div ref={ref} className="bg-white text-slate-950 p-10 text-[16px]" style={{ width: 794, minHeight: 1080, fontFamily: "Arial, sans-serif" }} data-testid="invoice-document">
      <div className="flex items-center gap-3">
        <Logo />
        <div>
          <p className="text-[32px] font-extrabold leading-tight tracking-tight"><span className="text-blue-700">{invoiceBrand.blue}</span>{invoiceBrand.blue && invoiceBrand.black ? " " : ""}<span className="text-slate-950">{invoiceBrand.black}</span></p>
        </div>
      </div>
      <div className="flex justify-between items-start mt-6">
        <div className="leading-7 text-slate-800">
          <p className="font-bold text-slate-950">{companyName}</p>
          <p className="whitespace-pre-line">{settings.address || COMPANY.address.join(", ")}</p>
          <p>Tel: {settings.telephone || COMPANY.phones}</p>
          {settings.email && <p>Email: {settings.email}</p>}
          {settings.tax_number && <p>VAT No: {settings.tax_number}</p>}
        </div>
        <div className="text-right"><p className="text-[30px] font-extrabold">INVOICE</p><p className="text-[18px] font-bold font-mono" data-testid="doc-invoice-number">{inv.number || "DRAFT"}</p></div>
      </div>
      <div className="border-t border-slate-200 mt-5 pt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[14px] font-bold uppercase text-slate-700 mb-1">Bill To</p>
          <L k="Customer:" v={inv.customer_name} /><L k="Address:" v={customer.address} /><L k="City:" v={customer.city} /><L k="Phone:" v={customer.phone} /><L k="Email:" v={customer.email} />
          <p className="text-[14px] font-bold uppercase text-slate-700 mt-3 mb-1">Ship To</p>
          <p className="leading-7 text-slate-800">{[inv.customer_name, shipTo].filter(Boolean).join(" — ")}</p>
        </div>
        <div className="justify-self-end w-[280px]">
            {[["Invoice Date:", fmtDate(inv.date)], ["Due Date:", fmtDate(inv.due_date)], ["Price Zone:", `Zone ${inv.zone}`], ["Payment Terms:", inv.payment_terms], ["Reference:", inv.reference]].filter(([k, v]) => v && (k !== "Price Zone:" || !settings.unified_price_list) && !(inv.opening_balance && k === "Reference:")).map(([k, v]) => (
            <div key={k} className="flex justify-between leading-7"><span className="font-semibold">{k}</span><span className="text-slate-800">{v}</span></div>))}
        </div>
      </div>
      {rows.length > 0 && <table className="w-full mt-6 border border-slate-300 text-[16px]">
        <thead><tr className="bg-slate-100 text-left">{["#", "Category", "Size", "Qty", "Unit Price", "Total"].map((h, i) => <th key={h} className={`px-3 py-3 font-bold ${i >= 3 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((it, i) => (
          <tr key={i} className="border-t border-slate-200">
            <td className="px-3 py-4">{i + 1}</td><td className="px-3 py-4">{it.category || it.description}</td><td className="px-3 py-4">{it.size}</td>
            <td className="px-3 py-4 text-right">{it.qty}</td><td className="px-3 py-4 text-right">{fmtMoney(it.unit_price)}</td><td className="px-3 py-4 text-right">{fmtMoney((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</td>
          </tr>))}</tbody>
      </table>}
      <div className="flex justify-end mt-4"><div className="w-[320px] text-[16px]">
        {[["Subtotal", totals.subtotal], ["Discount", Number(inv.discount) || 0], ...(Number(inv.extra_charges) ? [["Added", inv.extra_charges]] : []), ...(inv.tax_enabled ? [[`Tax (${inv.tax_rate}%)`, totals.tax]] : [])].map(([k, v]) => (
          <div key={k} className="flex justify-between py-1.5 px-3"><span className="font-semibold text-slate-700">{k}</span><span>{fmtMoney(v)}</span></div>))}
        <div className="flex justify-between py-2 px-3 text-[20px] font-extrabold"><span>Total</span><span data-testid="doc-total">{fmtMoney(totals.total)}</span></div>
        <div className="flex justify-between py-1.5 px-3 mt-3"><span className="font-semibold text-slate-700">Amount Paid</span><span>{fmtMoney(inv.amount_paid)}</span></div>
        <div className="flex justify-between py-3 px-3 bg-red-50 text-red-800 font-bold"><span>Outstanding Balance</span><span>{fmtMoney(totals.outstanding)}</span></div>
      </div></div>
      <div className="flex justify-between mt-10 border-b border-slate-300 pb-6">
        <div className="leading-7 whitespace-pre-line"><p className="font-bold text-[16px]">Banking Details</p><p className="text-slate-700">{settings.banking_details || "Bank: N/A"}</p><p className="text-slate-700">Reference: Use invoice number</p>
          {inv.notes && !inv.opening_balance && <p className="text-slate-800 mt-2"><b>Notes:</b> {inv.notes}</p>}</div>
        <p className="italic text-slate-700">Thank you for your business!</p>
      </div>
    </div>
  );
});
