import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard, Users, FileText, Boxes, Factory, CalendarCheck,
  Truck, Settings as Cog, Menu, X, LogOut, Search, Bell, Layers,
  ClipboardList, Banknote, Wrench,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/stock", label: "Stock", icon: Boxes },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/deliveries", label: "Deliveries", icon: Truck },
  { to: "/fleet", label: "Fleet", icon: Wrench },
  { to: "/expenses", label: "Expenses", icon: Banknote },
  { to: "/settings", label: "Settings", icon: Cog },
];

function SidebarContent({ onNav }) {
  return (
    <>
      <div className="flex items-center gap-3 px-6 h-20 border-b border-white/10">
        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Layers className="text-white" size={22} />
        </div>
        <div>
          <div className="text-white font-bold text-base font-display leading-tight">SUPER IQ-FOAM</div>
          <div className="text-slate-400 text-[11px] font-medium">Business Management</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onNav}
            data-testid={`nav-${n.label.toLowerCase()}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                isActive ? "bg-primary text-white shadow" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <n.icon size={18} />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-[hsl(222_47%_11%)] z-30">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <aside className="relative w-64 flex flex-col bg-[hsl(222_47%_11%)]">
            <button className="absolute top-5 right-4 text-slate-300" onClick={() => setOpen(false)}>
              <X size={22} />
            </button>
            <SidebarContent onNav={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 h-16 bg-white/90 backdrop-blur border-b border-border flex items-center gap-4 px-4 sm:px-6">
          <button className="lg:hidden text-slate-600" onClick={() => setOpen(true)} data-testid="menu-toggle">
            <Menu size={22} />
          </button>
          <div className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                data-testid="global-search"
                placeholder="Search invoices, customers..."
                className="w-full rounded-lg bg-slate-100 border border-transparent pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:bg-white"
                onKeyDown={(e) => { if (e.key === "Enter" && e.target.value) nav(`/invoices?q=${encodeURIComponent(e.target.value)}`); }}
              />
            </div>
          </div>
          <div className="flex-1 sm:hidden" />
          <button className="relative text-slate-500 hover:text-slate-800" data-testid="notifications-btn">
            <Bell size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
              {(user?.name || "A")[0]}
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-semibold text-slate-800">{user?.name || "Admin"}</div>
              <div className="text-[11px] text-slate-400">Administrator</div>
            </div>
            <button onClick={logout} data-testid="logout-btn" className="text-slate-400 hover:text-red-600 ml-1">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-[1500px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
