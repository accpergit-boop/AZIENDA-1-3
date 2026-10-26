import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { today } from "@/lib/format";
import { Card, Btn, Input, Select, Modal, PageHeader, Empty } from "@/components/common";
import { Users, Plus, CheckCheck, Pencil, CalendarCheck, Wallet, History, Landmark, Trash2 } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

const DEPTS = ["Production", "Cutting", "Sewing", "Mattress Processing", "Dispatch", "Administration", "Drivers"];

const weekPeriod = (offset = 0) => {
  const start = new Date(`${today()}T00:00:00Z`);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday + offset * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};

function SalaryEmployeeCard({ employee, rate, deduction, saving, onRateChange, onSaveRate, onDeductionChange, onSaveCut, onAddAdvance, onViewHistory, onDelete }) {
  const remainingBalance = employee.available_balance - deduction;
  const takeHome = employee.gross_salary - deduction;
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md" data-testid={`salary-row-${employee.employee_id}`}>
      <header className="flex items-start justify-between gap-3 border-b border-border bg-slate-50/80 px-4 py-3">
        <div><h3 className="font-bold text-slate-800">{employee.name}</h3><p className="mt-0.5 text-xs text-slate-500">{employee.department || "Employee"}{employee.active === false ? " · Inactive" : ""}</p></div>
        <button onClick={onViewHistory} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/20 bg-white px-2.5 py-2 text-xs font-semibold text-primary hover:bg-primary/5" data-testid={`salary-history-${employee.employee_id}`}><History size={14} /> View past balances &amp; cuts</button>
      </header>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hourly rate</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-sm text-slate-500">R</span>
              <input aria-label={`Hourly pay for ${employee.name}`} type="number" min="0.01" step="0.01" disabled={saving} value={rate ?? employee.hourly_rate}
                onChange={(event) => onRateChange(event.target.value)}
                className="min-w-0 flex-1 rounded border border-input px-2 py-1.5 font-mono text-sm" data-testid={`salary-rate-${employee.employee_id}`} />
              <button disabled={saving} onClick={onSaveRate} className="text-xs font-semibold text-primary hover:underline disabled:opacity-50" data-testid={`save-salary-rate-${employee.employee_id}`}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pay earned this week</p>
            <p className="mt-1.5 font-mono text-lg font-bold text-slate-800">{fmtMoney(employee.gross_salary)}</p>
            <p className="text-xs text-slate-500">{employee.present_days} full + {employee.half_days} half · {employee.regular_hours + employee.overtime_hours} total hours</p>
          </div>
        </div>
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <h4 className="text-sm font-bold text-slate-800">Borrowed balance</h4>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div><p className="text-xs text-slate-600">Owed at start of week</p><p className="mt-0.5 font-mono font-semibold">{fmtMoney(employee.balance_before_period)}</p></div>
            <label className="block"><span className="block text-xs text-slate-600">Deduct this week</span><span className="mt-0.5 flex items-center gap-1 rounded border border-input bg-white px-2"><span className="text-xs text-slate-500">R</span><input aria-label={`Deduct from balance for ${employee.name}`} type="number" min="0" max={Math.min(employee.available_balance, employee.gross_salary)} step="0.01" value={deduction}
              onChange={(event) => onDeductionChange(event.target.value)}
              className="min-w-0 w-full border-0 bg-transparent py-1.5 font-mono text-sm outline-none" data-testid={`salary-cut-${employee.employee_id}`} /></span></label>
          </div>
          <p className="mt-2 border-t border-amber-200/70 pt-2 text-sm">Still owed after this week: <strong className="font-mono">{fmtMoney(remainingBalance)}</strong></p>
          {employee.balance_before_period <= 0 && <p className="mt-1 text-xs text-slate-500">No borrowed balance was owed at the start of this week.</p>}
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Take-home pay after deduction</p><p className="font-mono text-xl font-bold text-emerald-700">{fmtMoney(takeHome)}</p></div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="outline" disabled={saving} onClick={onAddAdvance} data-testid={`salary-advance-${employee.employee_id}`}>+ Add borrowed balance</Btn>
            <Btn disabled={saving} onClick={onSaveCut} data-testid={`save-salary-cut-${employee.employee_id}`}>{saving ? "Saving…" : "Save this week’s cut"}</Btn>
            {onDelete && <Btn variant="danger" disabled={saving} onClick={onDelete} data-testid={`delete-salary-employee-${employee.employee_id}`}><Trash2 size={15} /> Delete employee</Btn>}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [deletedEmployees, setDeletedEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [empModal, setEmpModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState("attendance");
  const [overtimeDraft, setOvertimeDraft] = useState({});
  const [salaryStart, setSalaryStart] = useState(() => weekPeriod().start);
  const [salaryEnd, setSalaryEnd] = useState(() => weekPeriod().end);
  const [salaryReport, setSalaryReport] = useState(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryCuts, setSalaryCuts] = useState({});
  const [salaryRates, setSalaryRates] = useState({});
  const [salarySaving, setSalarySaving] = useState({});
  const [historyEmployee, setHistoryEmployee] = useState(null);
  const [historyClearing, setHistoryClearing] = useState(false);
  const [advanceModal, setAdvanceModal] = useState(null);

  const load = () => {
    Promise.all([api.get("/employees"), api.get("/attendance"), api.get("/attendance/summary")])
      .then(([employeeData, attendanceData, summaryData]) => { setEmployees(employeeData); setRecords(attendanceData); setSummary(summaryData); })
      .catch((e) => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const active = employees.filter((e) => e.active !== false);
  const statusOf = (eid) => records.find((r) => r.employee_id === eid && r.date === date)?.status;
  const groups = useMemo(() => {
    const g = {};
    active.forEach((e) => { (g[e.department || "Other"] ||= []).push(e); });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [active]);
  const present = active.filter((e) => ["Present", "Half Day"].includes(statusOf(e.id))).length;
  const absent = active.filter((e) => statusOf(e.id) === "Absent").length;

  const mark = async (emp, status) => {
    const record = records.find((item) => item.employee_id === emp.id && item.date === date);
    try {
      await api.post("/attendance", { employee_id: emp.id, date, status, overtime_hours: status === "Absent" ? 0 : record?.overtime_hours || 0 });
      load();
    } catch (e) { toast.error(apiError(e)); }
  };
  const saveOvertime = async (employee) => {
    const record = records.find((item) => item.employee_id === employee.id && item.date === date);
    if (!record || !["Present", "Half Day"].includes(record.status)) return;
    const overtime = Number(overtimeDraft[employee.id] ?? record.overtime_hours ?? 0);
    if (!Number.isFinite(overtime) || overtime < 0) return toast.error("Overtime hours must be zero or more");
    try {
      const updated = await api.post("/attendance", { employee_id: employee.id, date, status: record.status, overtime_hours: overtime });
      setRecords((current) => current.map((item) => item.id === updated.id ? updated : item));
      setOvertimeDraft((current) => { const next = { ...current }; delete next[employee.id]; return next; });
    } catch (e) { toast.error(apiError(e)); }
  };
  const markAll = async () => {
    if (busy) return; setBusy(true);
    try { await api.post("/attendance/bulk", { date, status: "Present", employee_ids: active.map((e) => e.id) }); toast.success("All marked present"); load(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const saveEmp = async () => {
    if (!empModal.name.trim()) return toast.error("Name required");
    try { empModal.id ? await api.put(`/employees/${empModal.id}`, empModal) : await api.post("/employees", empModal); setEmpModal(null); load(); toast.success("Employee saved"); }
    catch (e) { toast.error(apiError(e)); }
  };
  const deleteEmployee = async (employee) => {
    if (!window.confirm(`Permanently delete ${employee.name} from this profile? The employee will appear in Deleted employees; attendance and salary history will be retained.`)) return;
    try {
      await api.del(`/employees/${employee.id}`);
      setEmployees((current) => current.filter((item) => item.id !== employee.id));
      toast.success("Employee permanently deleted; history retained");
    } catch (error) {
      toast.error(apiError(error));
      return;
    }
    try { setDeletedEmployees(await api.get("/employees/deleted")); }
    catch (error) { toast.error(`Employee deleted, but deleted-employee archive could not be refreshed: ${apiError(error)}`); }
    if (salaryReport) await loadSalaries();
  };
  const loadSalaries = async (startDate = salaryStart, endDate = salaryEnd) => {
    if (!startDate || !endDate) return toast.error("Select both salary period dates");
    if (endDate < startDate) return toast.error("The end date must be on or after the start date");
    setSalaryLoading(true);
    try {
      const report = await api.get("/salaries", { start_date: startDate, end_date: endDate });
      setSalaryReport(report);
      setSalaryCuts(Object.fromEntries(report.employees.map((employee) => [employee.employee_id, String(employee.cut || 0)])));
      setSalaryRates(Object.fromEntries(report.employees.map((employee) => [employee.employee_id, String(employee.hourly_rate || 20)])));
    } catch (e) { toast.error(apiError(e)); } finally { setSalaryLoading(false); }
  };
  const saveSalaryRate = async (employee) => {
    const rate = Number(salaryRates[employee.employee_id]);
    if (!Number.isFinite(rate) || rate <= 0) return toast.error("Hourly pay must be greater than zero");
    setSalarySaving((current) => ({ ...current, [employee.employee_id]: true }));
    try {
      await api.put(`/salaries/rates/${employee.employee_id}`, { hourly_rate: rate });
      toast.success(`Hourly pay updated for ${employee.name}`);
      await loadSalaries();
    } catch (e) { toast.error(apiError(e)); } finally {
      setSalarySaving((current) => ({ ...current, [employee.employee_id]: false }));
    }
  };
  const saveSalaryCut = async (employee) => {
    const amount = Number(salaryCuts[employee.employee_id] || 0);
    if (!Number.isFinite(amount) || amount < 0) return toast.error("Cut amount must be zero or more");
    setSalarySaving((current) => ({ ...current, [employee.employee_id]: true }));
    try {
      await api.post("/salaries/cuts", {
        employee_id: employee.employee_id, start_date: salaryStart, end_date: salaryEnd, amount,
      });
      toast.success("Salary cut saved and balance updated");
      await loadSalaries();
    } catch (e) { toast.error(apiError(e)); } finally {
      setSalarySaving((current) => ({ ...current, [employee.employee_id]: false }));
    }
  };
  const saveAdvance = async () => {
    if (!advanceModal || !(Number(advanceModal.amount) > 0)) return toast.error("Enter an advance amount greater than zero");
    try {
      await api.post("/salaries/advances", { ...advanceModal, amount: Number(advanceModal.amount) });
      toast.success("Salary advance recorded");
      setAdvanceModal(null);
      await loadSalaries();
    } catch (e) { toast.error(apiError(e)); }
  };
  const clearSalaryHistory = async () => {
    if (!historyEmployee || historyClearing) return;
    const confirmed = window.confirm(
      `Permanently clear all borrowed amounts and salary cuts for ${historyEmployee.name}? This will reset their outstanding balance to R 0.00. This action cannot be undone.`,
    );
    if (!confirmed) return;
    setHistoryClearing(true);
    try {
      await api.del(`/salaries/history/${historyEmployee.employee_id}`);
      toast.success(`Balance and cut history cleared for ${historyEmployee.name}`);
      setHistoryEmployee(null);
      await loadSalaries();
    } catch (e) { toast.error(apiError(e)); } finally { setHistoryClearing(false); }
  };
  const salaryTotals = salaryReport?.employees.reduce((totals, employee) => ({
    gross: totals.gross + employee.gross_salary,
    cuts: totals.cuts + employee.cut,
    net: totals.net + employee.net_salary,
    balance: totals.balance + employee.balance,
  }), { gross: 0, cuts: 0, net: 0, balance: 0 });
  const chooseSalaryWeek = (offset) => {
    const period = weekPeriod(offset);
    setSalaryStart(period.start);
    setSalaryEnd(period.end);
    loadSalaries(period.start, period.end);
  };
  const Stat = ({ l, v, cls, k }) => <Card className="p-4" data-testid={`att-${k}`}><p className="text-xs text-slate-400 uppercase font-semibold">{l}</p><p className={`text-2xl font-bold font-mono mt-1 ${cls}`}>{v}</p></Card>;

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" subtitle="Tap Present or Absent for each employee">
        {section === "attendance" && <>
          <Btn variant="outline" onClick={() => setEmpModal({ name: "", department: "Production", active: true })} data-testid="add-employee-btn"><Plus size={16} /> Employee</Btn>
          <Btn disabled={loading || busy || !active.length} onClick={markAll} data-testid="mark-all-present-btn"><CheckCheck size={16} /> Mark All Present</Btn>
        </>}
      </PageHeader>
      <div className="flex gap-2 border-b border-border">
        <button onClick={() => setSection("attendance")} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${section === "attendance" ? "border-primary text-primary" : "border-transparent text-slate-500"}`} data-testid="attendance-section-tab"><CalendarCheck size={16} /> Attendance</button>
        {(user?.is_admin || user?.role === "admin") && <button onClick={() => setSection("salaries")} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${section === "salaries" ? "border-primary text-primary" : "border-transparent text-slate-500"}`} data-testid="salary-section-tab"><Wallet size={16} /> Salaries</button>}
        {user?.is_owner && <button onClick={async () => {
          setSection("deleted");
          try { setDeletedEmployees(await api.get("/employees/deleted")); }
          catch (error) { toast.error(apiError(error)); }
        }} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${section === "deleted" ? "border-primary text-primary" : "border-transparent text-slate-500"}`} data-testid="deleted-employees-tab"><Trash2 size={15} /> Deleted employees ({deletedEmployees.length})</button>}
      </div>
      {section === "deleted" && user?.is_owner ? (
        <Card className="overflow-hidden">
          {deletedEmployees.length === 0 ? <Empty icon={Users} title="No deleted employees" /> : <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-left text-xs text-slate-400"><th className="px-4 py-3">Name</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Deleted</th></tr></thead>
              <tbody>{deletedEmployees.map((employee) => <tr key={employee.id} className="border-t border-border/60" data-testid={`deleted-employee-row-${employee.id}`}>
                <td className="px-4 py-3 font-semibold text-slate-800">{employee.name}</td><td className="px-4 py-3 text-slate-500">{employee.department || "—"}</td><td className="px-4 py-3 text-slate-500">{employee.deleted_at ? new Date(employee.deleted_at).toLocaleString() : "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </Card>
      ) : section === "salaries" && (user?.is_admin || user?.role === "admin") ? (
        <div className="space-y-4">
          <Card className="space-y-4 p-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-800">Choose pay period</h2>
              <p className="mt-1 text-sm text-slate-500">Each cut is saved against the selected dates. Start a new week by selecting “This week”; previous balances carry forward automatically.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-44"><Input label="Week starts" type="date" value={salaryStart} onChange={(event) => { setSalaryStart(event.target.value); setSalaryReport(null); }} data-testid="salary-start-date" /></div>
              <div className="w-44"><Input label="Week ends" type="date" value={salaryEnd} onChange={(event) => { setSalaryEnd(event.target.value); setSalaryReport(null); }} data-testid="salary-end-date" /></div>
              <Btn variant="outline" disabled={salaryLoading} onClick={() => chooseSalaryWeek(0)} data-testid="salary-this-week-btn">This week (Mon–Sun)</Btn>
              <Btn variant="outline" disabled={salaryLoading} onClick={() => chooseSalaryWeek(-1)} data-testid="salary-last-week-btn">Last week</Btn>
              <Btn disabled={salaryLoading} onClick={loadSalaries} data-testid="load-salaries-btn">{salaryLoading ? "Loading..." : "Show salaries"}</Btn>
            </div>
            <p className="border-t border-border pt-3 text-xs leading-relaxed text-slate-500">Pay is based on each worker’s saved hourly rate. A full day is 8 paid hours (lunch excluded), a half day is 4 hours, and overtime uses the same rate. To pay a new week: choose the week, check attendance and pay, enter the amount to deduct from any balance, then save that week’s cut. Any unpaid balance stays on the account.</p>
          </Card>
          {salaryReport && <Card className="overflow-hidden">
            {salaryReport.employees.length === 0 ? <Empty icon={Users} title="No employees found" /> : <>
            <div className="grid grid-cols-2 gap-3 border-b border-border p-4 sm:grid-cols-4">
              {[["Gross payroll", salaryTotals.gross], ["Cuts this period", salaryTotals.cuts], ["Net pay", salaryTotals.net], ["Outstanding balances", salaryTotals.balance]].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/70 bg-gradient-to-br from-white to-slate-50 p-3 transition-transform duration-200 hover:-translate-y-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-mono text-lg font-bold text-slate-800">{fmtMoney(value)}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-2">
              {salaryReport.employees.map((employee) => {
                const deduction = Number(salaryCuts[employee.employee_id] ?? employee.cut) || 0;
                const saving = !!salarySaving[employee.employee_id];
                return <SalaryEmployeeCard
                  key={employee.employee_id}
                  employee={employee}
                  rate={salaryRates[employee.employee_id]}
                  deduction={deduction}
                  saving={saving}
                  onRateChange={(value) => setSalaryRates((current) => ({ ...current, [employee.employee_id]: value }))}
                  onSaveRate={() => saveSalaryRate(employee)}
                  onDeductionChange={(value) => setSalaryCuts((current) => ({ ...current, [employee.employee_id]: value }))}
                  onSaveCut={() => saveSalaryCut(employee)}
                  onAddAdvance={() => setAdvanceModal({ employee_id: employee.employee_id, employee_name: employee.name, date: today(), amount: "", notes: "" })}
                  onViewHistory={() => setHistoryEmployee(employee)}
                  onDelete={user?.is_owner ? () => deleteEmployee({ id: employee.employee_id, name: employee.name }) : undefined}
                />;
              })}
            </div>
            </>}
          </Card>}
        </div>
      ) : (
      <>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-48"><Input label="Date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setOvertimeDraft({}); }} data-testid="attendance-date-input" /></div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat l="Present (day)" v={loading ? "..." : present} cls="text-emerald-600" k="day-present" />
        <Stat l="Absent (day)" v={loading ? "..." : absent} cls="text-red-600" k="day-absent" />
        <Stat l="Not marked" v={loading ? "..." : active.length - present - absent} cls="text-slate-500" k="day-unmarked" />
        <Stat l="Present days (week)" v={loading ? "..." : summary?.week_total ?? 0} cls="text-slate-800" k="week" />
        <Stat l="Present days (month)" v={loading ? "..." : summary?.month_total ?? 0} cls="text-slate-800" k="month" />
      </div>
      {loading ? <Card><p className="p-6 text-sm text-slate-400" role="status">Loading employees...</p></Card> : active.length === 0 ? <Card><Empty icon={Users} title="No employees yet" hint="Add employees with the + Employee button." /></Card> : groups.map(([dept, list]) => (
        <Card key={dept} className="p-4">
          <p className="text-xs font-bold uppercase text-slate-500 mb-3">{dept} <span className="text-slate-300">· {list.length}</span></p>
          <div className="space-y-2">{list.map((e) => {
            const s = statusOf(e.id);
            const per = summary?.per_employee?.find((p) => p.employee_id === e.id);
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2" data-testid={`att-row-${e.id}`}>
                <div className="flex-1 min-w-[140px]"><p className="font-semibold text-slate-800">{e.name}</p><p className="text-[11px] text-slate-400">Week {per?.week ?? 0} · Month {per?.month ?? 0} days</p></div>
                <button onClick={() => mark(e, "Present")} data-testid={`present-btn-${e.id}`} className={`h-12 w-32 rounded-xl text-sm font-bold border-2 transition-colors ${s === "Present" ? "bg-emerald-600 border-emerald-600 text-white" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>Present</button>
                <button onClick={() => mark(e, "Absent")} data-testid={`absent-btn-${e.id}`} className={`h-12 w-32 rounded-xl text-sm font-bold border-2 transition-colors ${s === "Absent" ? "bg-red-600 border-red-600 text-white" : "border-red-200 text-red-700 hover:bg-red-50"}`}>Absent</button>
                {["Present", "Half Day"].includes(s) && <div className="w-32"><Input label="Overtime hours" type="number" min="0" step="0.25" value={overtimeDraft[e.id] ?? records.find((record) => record.employee_id === e.id && record.date === date)?.overtime_hours ?? 0}
                  onChange={(event) => setOvertimeDraft((current) => ({ ...current, [e.id]: event.target.value }))} onBlur={() => saveOvertime(e)} data-testid={`attendance-overtime-${e.id}`} /></div>}
                <button onClick={() => setEmpModal({ ...e })} className="text-slate-300 hover:text-primary" data-testid={`edit-employee-${e.id}`}><Pencil size={15} /></button>
                {user?.is_owner && <button onClick={() => deleteEmployee(e)} className="text-slate-300 hover:text-red-600" aria-label={`Permanently delete ${e.name}`} title="Permanently delete employee" data-testid={`delete-employee-${e.id}`}><Trash2 size={15} /></button>}
              </div>);
          })}</div>
        </Card>))}
      <Modal open={!!empModal} onClose={() => setEmpModal(null)} title={empModal?.id ? "Edit Employee" : "Add Employee"}>
        {empModal && <div className="space-y-4">
          <Input label="Name *" value={empModal.name} onChange={(e) => setEmpModal({ ...empModal, name: e.target.value })} data-testid="employee-name-input" />
          <Select label="Department" value={empModal.department} onChange={(e) => setEmpModal({ ...empModal, department: e.target.value })} data-testid="employee-dept-select">{DEPTS.map((d) => <option key={d}>{d}</option>)}</Select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={empModal.active !== false} onChange={(e) => setEmpModal({ ...empModal, active: e.target.checked })} /> Active</label>
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setEmpModal(null)}>Cancel</Btn><Btn onClick={saveEmp} data-testid="save-employee-btn">Save</Btn></div>
        </div>}
      </Modal>
      </>
      )}
      <Modal open={!!historyEmployee} onClose={() => setHistoryEmployee(null)} title={`Past balances & cuts — ${historyEmployee?.name || ""}`} wide>
        {historyEmployee && <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <strong>Current outstanding balance: {fmtMoney(salaryReport?.employees.find((employee) => employee.employee_id === historyEmployee.employee_id)?.balance ?? historyEmployee.balance)}</strong>
            <p className="mt-1 text-xs">Each advance adds to the amount owed. Each salary cut subtracts from it. The balance carries over automatically into the next week.</p>
          </div>
          {historyEmployee.balance_history?.length ? <div className="max-h-[55vh] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[650px] text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Entry</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Owed before</th><th className="px-3 py-2 text-right">Owed after</th><th className="px-3 py-2">Notes</th></tr></thead>
              <tbody>{historyEmployee.balance_history.map((entry) => <tr key={`${entry.type}-${entry.id}`} className="border-t border-border/70">
                <td className="px-3 py-2"><span className="block font-semibold">{entry.date || "—"}</span>{entry.type === "cut" && <span className="text-xs text-slate-400">Week {entry.start_date} – {entry.end_date}</span>}</td>
                <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${entry.type === "cut" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>{entry.type === "cut" ? <Wallet size={12} /> : <Landmark size={12} />}{entry.type === "cut" ? "Salary cut" : "Money borrowed"}</span></td>
                <td className="px-3 py-2 text-right font-mono">{fmtMoney(entry.amount)}</td><td className="px-3 py-2 text-right font-mono">{fmtMoney(entry.balance_before)}</td><td className="px-3 py-2 text-right font-mono font-semibold">{fmtMoney(entry.balance_after)}</td><td className="px-3 py-2">{entry.notes || "—"}</td>
              </tr>)}</tbody>
            </table>
          </div> : <Empty icon={History} title="No past balances or cuts" hint="Any money borrowed or deducted will appear here." />}
          <div className="flex justify-end border-t border-border pt-3">
            <Btn variant="danger" disabled={historyClearing || !historyEmployee.balance_history?.length} onClick={clearSalaryHistory} data-testid={`clear-salary-history-${historyEmployee.employee_id}`}>
              {historyClearing ? "Clearing history…" : "Clear history"}
            </Btn>
          </div>
        </div>}
      </Modal>
      <Modal open={!!advanceModal} onClose={() => setAdvanceModal(null)} title={`Add balance — ${advanceModal?.employee_name || ""}`}>
        {advanceModal && <div className="space-y-4">
          <Input label="Amount borrowed (R)" type="number" min="0.01" step="0.01" value={advanceModal.amount} onChange={(event) => setAdvanceModal({ ...advanceModal, amount: event.target.value })} data-testid="salary-advance-amount" />
          <Input label="Date" type="date" value={advanceModal.date} onChange={(event) => setAdvanceModal({ ...advanceModal, date: event.target.value })} />
          <Input label="Notes" value={advanceModal.notes} onChange={(event) => setAdvanceModal({ ...advanceModal, notes: event.target.value })} />
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setAdvanceModal(null)}>Cancel</Btn><Btn onClick={saveAdvance} data-testid="save-salary-advance">Save advance</Btn></div>
        </div>}
      </Modal>
    </div>
  );
}
