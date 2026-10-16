import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import InvoiceList from "@/pages/InvoiceList";
import InvoiceEditor from "@/pages/InvoiceEditor";
import Orders from "@/pages/Orders";
import Stock from "@/pages/Stock";
import Production from "@/pages/Production";
import Attendance from "@/pages/Attendance";
import Deliveries from "@/pages/Deliveries";
import Fleet from "@/pages/Fleet";
import Expenses from "@/pages/Expenses";
import Settings from "@/pages/Settings";

function Protected({ children }) {
  const { user, booting } = useAuth();
  if (booting || user === null)
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
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
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
