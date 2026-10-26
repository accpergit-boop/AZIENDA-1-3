import { useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarDays, Download, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { today } from "@/lib/format";
import { downloadDailyReportPdf } from "@/lib/dailyReportPdf";
import { Btn } from "@/components/common";

const MIN_ROWS = 12;

function formatMoney(value) {
  return `R ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function ReportSection({ number, title, columns, rows, totalLabel, total, mainInvoiceNo }) {
  const visibleRows = Math.max(MIN_ROWS, rows.length);
  return (
    <section className="daily-report-section" aria-label={title}>
      <div className="daily-report-section-title">
        <span className="daily-report-number">{number}</span>
        <span>{title}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="daily-report-table">
          <thead>
            <tr>{columns.map((column) => <th key={column.key} className={column.align === "right" ? "text-right" : ""}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: visibleRows }, (_, index) => {
              const row = rows[index];
              return (
                <tr key={row?.id || `${number}-row-${index}`}>
                  {columns.map((column, columnIndex) => (
                    <td key={column.key} className={column.align === "right" ? "text-right" : ""}>
                      {row ? column.render(row, index) : columnIndex === 0 && number !== "04" ? index + 1 : ""}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr className="daily-report-total">
              <td colSpan={columns.length - 1}>{totalLabel}</td>
              <td className="text-right">{formatMoney(total)}</td>
            </tr>
            {number === "01" && (
              <tr className="daily-report-main-invoice">
                <td colSpan={columns.length - 1}>
                  <label className="flex items-center gap-2">
                    <span>Main Invoice No.</span>
                    <span>{mainInvoiceNo || "-"}</span>
                  </label>
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportTables({ report }) {
  return (
    <div className="daily-report-grid">
      <ReportSection
        number="01"
        title="DAILY SENDING INVOICES"
        columns={[
          { key: "no", label: "NO", render: (_row, index) => index + 1 },
          { key: "number", label: "INVOICE NO.", render: (row) => row.number },
          { key: "client", label: "CLIENT / DESCRIPTION", render: (row) => row.client_name },
          { key: "amount", label: "AMOUNT", align: "right", render: (row) => formatMoney(row.amount) },
        ]}
        rows={report.invoices || []}
        totalLabel="Total Sending"
        total={report.totals?.sending}
        mainInvoiceNo={report.main_invoice_no}
      />
      <ReportSection
        number="02"
        title="DAILY RECEIVING / CLIENT PAYMENTS"
        columns={[
          { key: "no", label: "NO", render: (_row, index) => index + 1 },
          { key: "client", label: "CLIENT NAME", render: (row) => row.client_name },
          { key: "invoice", label: "INV. NO.", render: (row) => row.invoice_number },
          { key: "amount", label: "AMOUNT", align: "right", render: (row) => formatMoney(row.amount) },
          { key: "notes", label: "NOTES", render: (row) => row.notes },
        ]}
        rows={report.payments || []}
        totalLabel="Total Received"
        total={report.totals?.received}
      />
      <ReportSection
        number="03"
        title="EXPENSES BREAKDOWN"
        columns={[
          { key: "no", label: "NO", render: (_row, index) => index + 1 },
          { key: "category", label: "CATEGORY", render: (row) => row.category },
          { key: "description", label: "DESCRIPTION", render: (row) => row.description },
          { key: "amount", label: "AMOUNT", align: "right", render: (row) => formatMoney(row.amount) },
        ]}
        rows={report.expenses || []}
        totalLabel="Total Expenses"
        total={report.totals?.expenses}
      />
      <ReportSection
        number="04"
        title="DIESEL USAGE (BY VEHICLE)"
        columns={[
          { key: "vehicle", label: "VEHICLE", render: (row) => row.vehicle },
          { key: "amount", label: "AMOUNT", align: "right", render: (row) => formatMoney(row.amount) },
          { key: "notes", label: "NOTES", render: (row) => row.notes },
        ]}
        rows={report.diesel_usage || []}
        totalLabel="Total Diesel"
        total={report.totals?.diesel}
      />
    </div>
  );
}

export default function DailyReport() {
  const [reportDate, setReportDate] = useState(today());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const followToday = useRef(true);

  useEffect(() => {
    let active = true;
    let firstLoad = true;
    let latestRequest = 0;
    const loadReport = async () => {
      const requestId = ++latestRequest;
      if (firstLoad && active) {
        setLoading(true);
        setReport(null);
        setError("");
      }
      try {
        const data = await api.get("/daily-report", { report_date: reportDate, refresh: Date.now() });
        if (!active || requestId !== latestRequest) return;
        setReport(data);
        setError("");
      } catch (requestError) {
        if (active && requestId === latestRequest) setError(apiError(requestError));
      } finally {
        if (active && firstLoad) setLoading(false);
        firstLoad = false;
      }
    };

    const refreshOnChange = () => { loadReport(); };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadReport();
    };
    loadReport();
    const interval = window.setInterval(() => {
      if (followToday.current && reportDate !== today()) {
        setReportDate(today());
        return;
      }
      loadReport();
    }, 20000);
    window.addEventListener("erp:data-changed", refreshOnChange);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("erp:data-changed", refreshOnChange);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [reportDate]);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      await downloadDailyReportPdf(report, report.main_invoice_no);
    } catch (pdfError) {
      toast.error(apiError(pdfError));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daily Report</h1>
          <p className="mt-1 text-sm text-slate-500">SUPER IQ-FOAM daily transaction summary</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><CalendarDays size={14} /> Report date</span>
            <input
              type="date"
              aria-label="Report date"
              value={reportDate}
              onChange={(event) => {
                const selected = event.target.value || today();
                followToday.current = selected === today();
                setReportDate(selected);
              }}
              className="rounded-md border border-input bg-white px-3 py-2.5 text-sm text-slate-800"
            />
          </label>
          <Btn onClick={downloadPdf} disabled={!report || loading || downloading} data-testid="daily-report-download-pdf">
            {downloading ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
            {downloading ? "Preparing PDF..." : "DOWNLOAD PDF"}
          </Btn>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {report?.unassigned_fuel_expenses?.length > 0 && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {report.unassigned_fuel_expenses.length} fuel/diesel expense{report.unassigned_fuel_expenses.length === 1 ? "" : "s"} ha{report.unassigned_fuel_expenses.length === 1 ? "s" : "n"} no vehicle assigned. Their amounts are included in Diesel Usage and Total Diesel; assign the correct vehicle in <Link className="font-semibold underline" to="/expenses">Expenses</Link>.
          <ul className="mt-1 list-inside list-disc text-xs">
            {report.unassigned_fuel_expenses.map((expense, index) => (
              <li key={`${expense.description}-${index}`}>{expense.description || "Fuel expense"} — {formatMoney(expense.amount)}</li>
            ))}
          </ul>
        </div>
      )}
      {report?.pending_invoices?.length > 0 && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {report.pending_invoices.length} invoice draft{report.pending_invoices.length === 1 ? "" : "s"} recorded on this date do not yet have an invoice number, so they are not counted as sent invoices.
          <ul className="mt-1 list-inside list-disc text-xs">
            {report.pending_invoices.map((invoice) => (
              <li key={invoice.id}>{invoice.client_name || "Client not set"} — {formatMoney(invoice.amount)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="daily-report-paper" aria-busy={loading}>
        <header className="daily-report-heading">
          <div className="daily-report-company">SUPER IQ-FOAM</div>
          <div className="daily-report-tagline">Mr. Zuny | Mr. Zuny</div>
          <div className="daily-report-title">DAILY REPORT</div>
          <div className="daily-report-meta">
            <span><strong>Date:</strong> {reportDate}</span>
            <span><strong>Prepared By:</strong> Mr. Zuny</span>
            <span><strong>Day:</strong> {report?.day || ""}</span>
          </div>
        </header>
        {loading ? (
          <div role="status" className="daily-report-loading">Loading report...</div>
        ) : report ? (
          <ReportTables report={report} />
        ) : (
          <div role="status" className="daily-report-loading">Report data could not be loaded.</div>
        )}
      </div>
    </div>
  );
}
