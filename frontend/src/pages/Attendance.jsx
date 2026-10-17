import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { today } from "@/lib/format";
import { Card, Btn, Input, Select, Modal, PageHeader, Empty } from "@/components/common";
import { Users, Plus, CheckCheck, Pencil } from "lucide-react";

const DEPTS = ["Production", "Cutting", "Sewing", "Mattress Processing", "Dispatch", "Administration", "Drivers"];

export default function Attendance() {
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [date, setDate] = useState(today());
  const [empModal, setEmpModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => { api.get("/employees").then(setEmployees); api.get("/attendance").then(setRecords); api.get("/attendance/summary").then(setSummary); };
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
    try { await api.post("/attendance", { employee_id: emp.id, date, status }); load(); } catch (e) { toast.error(apiError(e)); }
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
  const Stat = ({ l, v, cls, k }) => <Card className="p-4" data-testid={`att-${k}`}><p className="text-xs text-slate-400 uppercase font-semibold">{l}</p><p className={`text-2xl font-bold font-mono mt-1 ${cls}`}>{v}</p></Card>;

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" subtitle="Tap Present or Absent for each employee">
        <Btn variant="outline" onClick={() => setEmpModal({ name: "", department: "Production", active: true })} data-testid="add-employee-btn"><Plus size={16} /> Employee</Btn>
        <Btn disabled={busy || !active.length} onClick={markAll} data-testid="mark-all-present-btn"><CheckCheck size={16} /> Mark All Present</Btn>
      </PageHeader>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-48"><Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="attendance-date-input" /></div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat l="Present (day)" v={present} cls="text-emerald-600" k="day-present" />
        <Stat l="Absent (day)" v={absent} cls="text-red-600" k="day-absent" />
        <Stat l="Not marked" v={active.length - present - absent} cls="text-slate-500" k="day-unmarked" />
        <Stat l="Present days (week)" v={summary?.week_total ?? 0} cls="text-slate-800" k="week" />
        <Stat l="Present days (month)" v={summary?.month_total ?? 0} cls="text-slate-800" k="month" />
      </div>
      {active.length === 0 ? <Card><Empty icon={Users} title="No employees yet" hint="Add employees with the + Employee button." /></Card> : groups.map(([dept, list]) => (
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
                <button onClick={() => setEmpModal({ ...e })} className="text-slate-300 hover:text-primary" data-testid={`edit-employee-${e.id}`}><Pencil size={15} /></button>
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
    </div>
  );
}
