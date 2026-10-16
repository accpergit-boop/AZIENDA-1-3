export function fmtMoney(n) {
  const v = Number(n || 0);
  return "R " + v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(s) {
  if (!s) return "-";
  try {
    const d = new Date(s.length <= 10 ? s + "T00:00:00" : s);
    return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return s;
  }
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export const STATUS_META = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  issued: { label: "Issued", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  partially_paid: { label: "Partially Paid", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  paid: { label: "Paid", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  overdue: { label: "Overdue", cls: "bg-red-50 text-red-700 border-red-200" },
  void: { label: "Void", cls: "bg-slate-100 text-slate-400 border-slate-200 line-through" },
};
