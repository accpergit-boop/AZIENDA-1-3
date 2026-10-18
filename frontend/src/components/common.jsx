import { X } from "lucide-react";

export function Card({ className = "", children, ...p }) {
  return (
    <div className={`luxury-card bg-card rounded-lg border border-border shadow-sm ${className}`} {...p}>
      {children}
    </div>
  );
}

export function Btn({ variant = "primary", className = "", children, ...p }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-all duration-200 px-4 py-2.5 disabled:opacity-50 disabled:pointer-events-none";
  const v = {
    primary: "bg-primary text-primary-foreground shadow-sm hover:brightness-110 hover:shadow-md",
    ghost: "bg-transparent text-slate-600 hover:bg-secondary",
    outline: "border border-border bg-white text-slate-700 hover:border-primary/30 hover:bg-secondary/70",
    danger: "bg-red-700 text-white hover:bg-red-800",
    success: "bg-primary text-primary-foreground hover:brightness-110",
    subtle: "bg-accent text-accent-foreground hover:brightness-95",
  }[variant];
  return (
    <button className={`${base} ${v} ${className}`} {...p}>
      {children}
    </button>
  );
}

export function Input({ label, className = "", ...p }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</span>}
      <input
        className={`w-full rounded-md border border-input bg-white/90 px-3 py-2.5 text-sm text-slate-800 outline-none transition-shadow focus:ring-2 focus:ring-primary/20 focus:border-primary ${className}`}
        {...p}
      />
    </label>
  );
}

export function Select({ label, children, className = "", ...p }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</span>}
      <select
        className={`w-full rounded-md border border-input bg-white/90 px-3 py-2.5 text-sm text-slate-800 outline-none transition-shadow focus:ring-2 focus:ring-primary/20 focus:border-primary ${className}`}
        {...p}
      >
        {children}
      </select>
    </label>
  );
}

export function Textarea({ label, className = "", ...p }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</span>}
      <textarea
        className={`w-full rounded-md border border-input bg-white/90 px-3 py-2.5 text-sm text-slate-800 outline-none transition-shadow focus:ring-2 focus:ring-primary/20 focus:border-primary ${className}`}
        {...p}
      />
    </label>
  );
}

export function Badge({ children, cls = "bg-slate-100 text-slate-600 border-slate-200", ...p }) {
  return (
    <span {...p} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} my-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900 font-display">{title}</h3>
          <button onClick={onClose} data-testid="modal-close" className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 font-display">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Empty({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon className="text-slate-300 mb-3" size={40} />}
      <p className="text-slate-600 font-semibold">{title}</p>
      {hint && <p className="text-sm text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
