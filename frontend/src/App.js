import "@/App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import { pageLoaders } from "@/lib/pageLoaders";

const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(pageLoaders["/"]);
const Customers = lazy(pageLoaders["/customers"]);
const ClientPayments = lazy(pageLoaders["/client-payments"]);
const Buyings = lazy(pageLoaders["/buyings"]);
const InvoiceList = lazy(pageLoaders["/invoices"]);
const InvoiceEditor = lazy(pageLoaders["/invoices/new"]);
const Orders = lazy(pageLoaders["/orders"]);
const Stock = lazy(pageLoaders["/stock"]);
const Production = lazy(pageLoaders["/production"]);
const Attendance = lazy(pageLoaders["/attendance"]);
const Deliveries = lazy(pageLoaders["/deliveries"]);
const Fleet = lazy(pageLoaders["/fleet"]);
const Expenses = lazy(pageLoaders["/expenses"]);
const DailyReport = lazy(pageLoaders["/daily-report"]);
const Settings = lazy(pageLoaders["/settings"]);

function Protected({ children }) {
  const { user, booting } = useAuth();
  if (booting || user === null) return <RouteLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function SuperIqoamOnly({ children }) {
  const { user } = useAuth();
  if (user?.company_id !== "superiqfoam") return <Navigate to="/" replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <Suspense fallback={<RouteLoading />}><AuthCallback /></Suspense>;
  return (
        <Routes>
          <Route path="/login" element={<Suspense fallback={<RouteLoading />}><Login /></Suspense>} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/client-payments" element={<ClientPayments />} />
            <Route path="/buyings" element={<Buyings />} />
            <Route path="/invoices" element={<InvoiceList />} />
            <Route path="/invoices/new" element={<InvoiceEditor />} />
            <Route path="/invoices/:id" element={<InvoiceEditor />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/production" element={<Production />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/deliveries" element={<Deliveries />} />
            <Route path="/fleet" element={<Fleet />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/daily-report" element={<SuperIqoamOnly><DailyReport /></SuperIqoamOnly>} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
  );
}

function RouteLoading() {
  return <div className="route-loading" role="status" aria-live="polite">Loading workspace...</div>;
}

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
