import { forwardRef } from "react";
import { fmtMoney, fmtDate } from "@/lib/format";

export const COMPANY = { name: "SUPER IQ-FOAM", address: ["ROCKY RIDGE LODGE", "ROCKY RIDGE FARM", "KOKSTAD, 4700"], phones: "0659279036 - 0634029112" };

const Box = ({ title, children }) => (
  <div className="border border-slate-800">
    <div className="border-b border-slate-800 bg-slate-100 px-3 py-1 text-[12px] font-bold">{title}</div>
    <div className="px-3 py-2 text-[12px] leading-5 min-h-[84px] whitespace-pre-line">{children}</div>
  </div>
);

export const InvoiceDocument = forwardRef(function InvoiceDocument({ inv, totals, customer = {}, settings = {} }, ref) {
  const rows = (inv.items || []).filter((it) => it.size || it.description);
  const billTo = [inv.customer_name, customer.address, customer.city, customer.phone].filter(Boolean).join("\n");
  const shipTo = [inv.customer_name, inv.destination || customer.city || customer.address].filter(Boolean).join("\n");
  return (
    <div ref={ref} className="bg-white text-slate-900 mx-auto p-10 font-sans" style={{ width: 794, minHeight: 1050 }} data-testid="invoice-document">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[26px] font-extrabold tracking-wide">{COMPANY.name}</p>
          {COMPANY.address.map((l) => <p key={l} className="text-[12px] leading-5">{l}</p>)}
          <p className="text-[12px] leading-5">{COMPANY.phones}</p>
          {settings.email && <p className="text-[12px] leading-5">{settings.email}</p>}
          {settings.tax_number && <p className="text-[12px] leading-5">VAT No: {settings.tax_number}</p>}
        </div>
        <div className="text-right">
          <p className="text-[28px] font-bold mb-2">Invoice</p>
          <table className="border border-slate-800 text-[12px] ml-auto">
            <thead><tr className="bg-slate-100"><th className="border border-slate-800 px-4 py-1">Date</th><th className="border border-slate-800 px-4 py-1">Invoice No.</th></tr></thead>
            <tbody><tr><td className="border border-slate-800 px-4 py-1.5 text-center">{fmtDate(inv.date)}</td><td className="border border-slate-800 px-4 py-1.5 text-center font-mono">{inv.number || "DRAFT"}</td></tr></tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mt-8"><Box title="Bill To">{billTo}</Box><Box title="Ship To">{shipTo}</Box></div>

      <div className="flex justify-end mt-4">
        <table className="border border-slate-800 text-[12px]">
          <thead><tr className="bg-slate-100"><th className="border border-slate-800 px-4 py-1">Terms</th><th className="border border-slate-800 px-4 py-1">Due Date</th>{inv.reference && <th className="border border-slate-800 px-4 py-1">Reference</th>}</tr></thead>
          <tbody><tr><td className="border border-slate-800 px-4 py-1 text-center">{inv.payment_terms}</td><td className="border border-slate-800 px-4 py-1 text-center">{fmtDate(inv.due_date)}</td>{inv.reference && <td className="border border-slate-800 px-4 py-1 text-center">{inv.reference}</td>}</tr></tbody>
        </table>
      </div>

      <table className="w-full border border-slate-800 text-[12px] mt-4">
        <thead><tr className="bg-slate-100">
          <th className="border border-slate-800 px-2 py-1.5 w-20">Quantity</th><th className="border border-slate-800 px-2 py-1.5 text-left">Description</th>
          <th className="border border-slate-800 px-2 py-1.5 w-28 text-right">Rate</th><th className="border border-slate-800 px-2 py-1.5 w-32 text-right">Amount</th>
        </tr></thead>
        <tbody>
          {rows.map((it, i) => (
            <tr key={i}>
              <td className="border-x border-slate-800 px-2 py-1.5 text-center">{it.qty}</td>
              <td className="border-x border-slate-800 px-2 py-1.5">{[it.category, it.size].filter(Boolean).join(" ")}{it.description && it.category ? ` — ${it.description}` : it.category ? "" : it.description}</td>
              <td className="border-x border-slate-800 px-2 py-1.5 text-right">{fmtMoney(it.unit_price)}</td>
              <td className="border-x border-slate-800 px-2 py-1.5 text-right">{fmtMoney((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</td>
            </tr>))}
          <tr style={{ height: Math.max(40, 360 - rows.length * 28) }}><td className="border-x border-slate-800" /><td className="border-x border-slate-800" /><td className="border-x border-slate-800" /><td className="border-x border-slate-800" /></tr>
        </tbody>
      </table>

      <div className="flex justify-between mt-0">
        <div className="text-[11px] pt-3 pr-6 whitespace-pre-line flex-1">
          {inv.notes && <p className="mb-2"><b>Notes:</b> {inv.notes}</p>}
          {settings.banking_details && <p><b>Banking details:</b>{"\n"}{settings.banking_details}</p>}
        </div>
        <table className="border border-t-0 border-slate-800 text-[12px] w-[300px]">
          <tbody>
            {Number(inv.discount) > 0 && <tr><td className="px-3 py-1">Discount</td><td className="px-3 py-1 text-right">-{fmtMoney(inv.discount)}</td></tr>}
            {Number(inv.extra_charges) > 0 && <tr><td className="px-3 py-1">Additional Charges</td><td className="px-3 py-1 text-right">{fmtMoney(inv.extra_charges)}</td></tr>}
            {inv.tax_enabled && <tr><td className="px-3 py-1">Tax ({inv.tax_rate}%)</td><td className="px-3 py-1 text-right">{fmtMoney(totals.tax)}</td></tr>}
            <tr className="border-t border-slate-800"><td className="px-3 py-1.5 font-bold">Total</td><td className="px-3 py-1.5 text-right font-bold">{fmtMoney(totals.total)}</td></tr>
            <tr><td className="px-3 py-1">Payments/Credits</td><td className="px-3 py-1 text-right">{fmtMoney(inv.amount_paid)}</td></tr>
            <tr className="border-t border-slate-800 bg-slate-100"><td className="px-3 py-1.5 font-bold">Balance Due</td><td className="px-3 py-1.5 text-right font-bold">{fmtMoney(totals.outstanding)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});
