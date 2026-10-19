import { api } from "@/lib/api";

const invoiceEditor = () => import("@/pages/InvoiceEditor");

export const pageLoaders = {
  "/": () => import("@/pages/Dashboard"),
  "/assistant": () => import("@/pages/Assistant"),
  "/customers": () => import("@/pages/Customers"),
  "/invoices": () => import("@/pages/InvoiceList"),
  "/invoices/new": invoiceEditor,
  "/orders": () => import("@/pages/Orders"),
  "/stock": () => import("@/pages/Stock"),
  "/production": () => import("@/pages/Production"),
  "/attendance": () => import("@/pages/Attendance"),
  "/deliveries": () => import("@/pages/Deliveries"),
  "/fleet": () => import("@/pages/Fleet"),
  "/expenses": () => import("@/pages/Expenses"),
  "/settings": () => import("@/pages/Settings"),
};

const pageData = {
  "/": ["/dashboard"],
  "/assistant": ["/assistant/sessions"],
  "/customers": ["/customers"],
  "/invoices": ["/invoices"],
  "/invoices/new": ["/customers", "/prices", "/settings"],
  "/orders": ["/orders", "/customers", "/vehicles", "/stock", "/settings"],
  "/stock": ["/stock", "/stock/movements"],
  "/production": ["/production/daily"],
  "/attendance": ["/employees", "/attendance", "/attendance/summary"],
  "/deliveries": ["/deliveries", "/customers", "/drivers", "/vehicles", "/stock"],
  "/fleet": ["/vehicles", "/vehicles/records/all", "/spareparts"],
  "/expenses": ["/expenses", "/reports/profit", "/reports/costs", "/vehicles"],
  "/settings": ["/settings", "/prices", "/drivers"],
};

export function preloadPage(path) {
  const pathname = path.split("?")[0];
  const route = pathname.startsWith("/invoices/") ? "/invoices/new" : pathname;
  pageLoaders[route]?.().catch(() => {});
  pageData[route]?.forEach((endpoint) => api.get(endpoint).catch(() => {}));
}