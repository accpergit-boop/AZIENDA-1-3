import { forwardRef } from "react";
import { COMPANY } from "@/components/InvoiceDocument";

const T = {
  en: { title: "DELIVERY NOTE", date: "Date", no: "Note No.", deliverTo: "Deliver To", details: "Details", qty: "Quantity", product: "Product", size: "Size", total: "Total pieces",
    priority: "Priority", ship: "Ship date", vehicle: "Vehicle", notes: "Notes", received: "Received in good order by", sign: "Signature", name: "Name", driver: "Driver" },
  ur: { title: "ڈلیوری نوٹ", date: "تاریخ", no: "نوٹ نمبر", deliverTo: "ترسیل برائے", details: "تفصیلات", qty: "مقدار", product: "پروڈکٹ", size: "سائز", total: "کل تعداد",
    priority: "ترجیح", ship: "روانگی کی تاریخ", vehicle: "گاڑی", notes: "نوٹس", received: "سامان درست حالت میں وصول کیا", sign: "دستخط", name: "نام", driver: "ڈرائیور" },
};
const UR_PRODUCTS = { Simple: "سادہ", Standard: "سادہ", "Ribbon Black": "ربن کالا", "Ribbon Pink": "ربن گلابی", "Strong Boy": "سٹرانگ بوائے", Uncovered: "بغیر کور", Candy: "کینڈی", "Uncovered Blue 16 Density": "بغیر کور نیلا 16 ڈینسٹی" };
const UR_PRIORITY = { Low: "کم", Normal: "عام", High: "زیادہ", Urgent: "فوری" };

export function orderLines(order) {
  if (order.items?.length) return order.items.filter((i) => Number(i.qty) > 0);
  return (order.products || "").split(/\n|,/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d+)\s*[x×]?\s*(.*)$/i);
    return m ? { qty: Number(m[1]), category: m[2], size: "" } : { qty: "", category: l, size: "" };
  });
}

export const DeliveryNote = forwardRef(function DeliveryNote({ order, lang = "en", vehicleName = "", settings = {} }, ref) {
  const t = T[lang]; const ur = lang === "ur";
  const lines = orderLines(order);
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const prod = (c) => (ur ? UR_PRODUCTS[c] || c : c);
  const cell = "border border-slate-800 px-3 py-1.5";
  return (
    <div ref={ref} dir={ur ? "rtl" : "ltr"} lang={lang} className="bg-white text-slate-900 mx-auto p-10" style={{ width: 794, minHeight: 1050, fontFamily: ur ? "'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',Tahoma,sans-serif" : undefined }} data-testid="delivery-note">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[26px] font-extrabold" dir="ltr">{settings.company_name || COMPANY.name}</p>
          <p className="whitespace-pre-line text-[12px] leading-5" dir="ltr">{settings.address || COMPANY.address.join(", ")}</p>
          <p className="text-[12px] leading-5" dir="ltr">{settings.telephone || COMPANY.phones}</p>
        </div>
        <div className={ur ? "text-left" : "text-right"}>
          <p className="text-[26px] font-bold mb-2">{t.title}</p>
          <table className="border border-slate-800 text-[12px]">
            <thead><tr className="bg-slate-100"><th className={cell}>{t.date}</th><th className={cell}>{t.no}</th></tr></thead>
            <tbody><tr><td className={cell} dir="ltr">{order.expected_ship_date || new Date().toISOString().slice(0, 10)}</td><td className={`${cell} font-mono`} dir="ltr">{order.reference}</td></tr></tbody>
          </table>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-8 mt-8 text-[12px]">
        <div className="border border-slate-800"><div className="border-b border-slate-800 bg-slate-100 px-3 py-1 font-bold">{t.deliverTo}</div><div className="px-3 py-2 min-h-[70px] leading-6"><p dir="ltr" className={ur ? "text-right" : ""}>{order.customer_name}</p><p dir="ltr" className={ur ? "text-right" : ""}>{order.destination}</p></div></div>
        <div className="border border-slate-800"><div className="border-b border-slate-800 bg-slate-100 px-3 py-1 font-bold">{t.details}</div><div className="px-3 py-2 min-h-[70px] leading-6">
          <p>{t.priority}: {ur ? UR_PRIORITY[order.priority] || order.priority : order.priority}</p>{vehicleName && <p>{t.vehicle}: <span dir="ltr">{vehicleName}</span></p>}</div></div>
      </div>
      <table className="w-full border border-slate-800 text-[13px] mt-6">
        <thead><tr className="bg-slate-100"><th className={`${cell} w-24`}>{t.qty}</th><th className={cell}>{t.product}</th><th className={`${cell} w-32`}>{t.size}</th></tr></thead>
        <tbody>
          {lines.map((l, i) => <tr key={i}><td className={`${cell} text-center font-bold`}>{l.qty}</td><td className={cell}>{prod(l.category)}</td><td className={`${cell} text-center`} dir="ltr">{l.size}</td></tr>)}
          <tr className="bg-slate-100"><td className={`${cell} text-center font-bold`}>{total}</td><td className={`${cell} font-bold`} colSpan={2}>{t.total}</td></tr>
        </tbody>
      </table>
      {order.notes && <p className="text-[12px] mt-4"><b>{t.notes}:</b> {order.notes}</p>}
      <div className="grid grid-cols-3 gap-8 mt-24 text-[12px]">
        {[t.received, t.name, t.driver].map((x) => <div key={x}><div className="border-b border-slate-800 h-10" /><p className="mt-1">{x} / {t.sign}</p></div>)}
      </div>
    </div>
  );
});
