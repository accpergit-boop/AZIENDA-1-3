import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { today } from "@/lib/format";
import { Card, Btn, Input, Select, Badge, Modal, PageHeader, Empty } from "@/components/common";
import { CalendarCheck, Plus, UserPlus } from "lucide-react";

const STATUSES = ["Present", "Half Day", "Absent", "Leave", "Sick", "Other"];
const META = {
  Present: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Absent: "bg-red-50 text-red-700 border-red-200",
  "Sick Leave": "bg-amber-50 text-amber-700 border-amber-200",
  "Annual Leave": "bg-blue-50 text-blue-700 border-blue-200",
  "Other Approved Leave": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Half Day": "bg-slate-100 text-slate-600 border-slate-200",
};

export default function Attendance() {
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [date, setDate] = useState(today());
  const [dept, setDept] = useState("all");
  const [empModal, setEmpModal] = useState(null);

  const load = () => { api.get("/employees").then(setEmployees); api.get("/attendance").then(setRecords); };
  useEffect(() => { load(); }, []);

  const depts = ["all", ...new Set(employees.map((e) => e.department))];
  const dayRec = (eid) => records.find((r) => r.employee_id === eid && r.date === date);

  const mark = async (emp, status) => {
    try { await api.post("/attendance", { employee_id: emp.id, date, status }); api.get("/attendance").then(setRecords); }
    catch (e) { toast.error(apiError(e)); }
  };

  const saveEmp = async () => {
    if (!empModal.name.trim()) return toast.error("Name required");
    try {
      if (empModal.id) await api.put(`/employees/${empModal.id}`, empModal);
      else await api.post("/employees", empModal);
      toast.success("Employee saved"); setEmpModal(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const shown = employees.filter((e) => dept === "all" || e.department === dept);

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Record daily employee attendance">
        <Btn variant="outline" onClick={() => window.print()}>Print Report</Btn>
        <Btn onClick={() => setEmpModal({ name: "", department: "Production", active: true })} data-testid="add-employee-btn"><UserPlus size={16} /> Add Employee</Btn>
      </PageHeader>

      <Card className="p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-48" data-testid="attendance-date" />
        <Select label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="sm:w-48">
          {depts.map((d) => <option key={d} value={d}>{d === "all" ? "All Departments" : d}</option>)}
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {shown.length === 0 ? <Empty icon={CalendarCheck} title="No employees yet" hint="Add employees to record attendance." /> : (
          <div className="divide-y divide-border">
            {shown.map((e) => {
              const rec = dayRec(e.id);
              return (
                <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4" data-testid={`employee-row-${e.id}`}>
                  <div><p className="font-semibold text-slate-800">{e.name}</p><p className="text-xs text-slate-400">{e.department}</p></div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {rec && <Badge cls={META[rec.status]}>{rec.status}</Badge>}
                    <select value={rec?.status || ""} onChange={(ev) => mark(e, ev.target.value)} data-testid={`attendance-select-${e.id}`}
                      className="rounded-lg border border-input px-3 py-2 text-sm">
                      <option value="" disabled>Mark...</option>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={!!empModal} onClose={() => setEmpModal(null)} title={empModal?.id ? "Edit Employee" : "Add Employee"}>
        {empModal && <div className="space-y-4">
          <Input label="Name *" value={empModal.name} onChange={(e) => setEmpModal({ ...empModal, name: e.target.value })} data-testid="employee-name-input" />
          <Input label="Department" value={empModal.department} onChange={(e) => setEmpModal({ ...empModal, department: e.target.value })} />
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={empModal.active} onChange={(e) => setEmpModal({ ...empModal, active: e.target.checked })} /> Active</label>
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setEmpModal(null)}>Cancel</Btn><Btn onClick={saveEmp} data-testid="save-employee-btn">Save</Btn></div>
        </div>}
      </Modal>
    </div>
  );
}
