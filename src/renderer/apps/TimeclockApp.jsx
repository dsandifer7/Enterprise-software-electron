import { useEffect, useMemo, useState } from "react";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function periodStart() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function periodEnd() {
  return new Date().toISOString();
}

export default function TimeclockApp({ tenantId }) {
  const [employees, setEmployees] = useState([]);
  const [liveBoard, setLiveBoard] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [summary, setSummary] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [policy, setPolicy] = useState({
    overtime_daily_hours: 8,
    overtime_weekly_hours: 40,
    max_break_minutes: 60,
    late_tolerance_minutes: 5,
    early_clock_in_minutes: 15,
    geofence_required: false,
  });
  const [message, setMessage] = useState("");
  const [employeeForm, setEmployeeForm] = useState({
    fullName: "",
    email: "",
    role: "staff",
    location: "",
  });
  const [eventForm, setEventForm] = useState({
    employeeId: "",
    eventType: "clock_in",
    occurredAt: new Date().toISOString(),
    reason: "",
  });
  const [shiftForm, setShiftForm] = useState({
    employeeId: "",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    location: "",
    role: "staff",
  });
  const [dayFilter, setDayFilter] = useState(todayDate());
  const [period, setPeriod] = useState({ start: periodStart(), end: periodEnd() });
  const [csvExport, setCsvExport] = useState("");

  const employeeNameById = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => map.set(employee.id, employee.full_name));
    return map;
  }, [employees]);

  async function loadCore() {
    const [
      employeesRes,
      liveRes,
      shiftsRes,
      exceptionsRes,
      summaryRes,
      alertsRes,
      policyRes,
    ] = await Promise.all([
      window.electronAPI.timeclock.listEmployees(tenantId),
      window.electronAPI.timeclock.liveBoard(tenantId),
      window.electronAPI.timeclock.listShifts({
        tenantId,
        dateFrom: dayFilter,
        dateTo: dayFilter,
      }),
      window.electronAPI.timeclock.listExceptions({ tenantId, day: dayFilter }),
      window.electronAPI.timeclock.timesheetSummary({
        tenantId,
        periodStart: period.start,
        periodEnd: period.end,
      }),
      window.electronAPI.timeclock.listAlerts(tenantId),
      window.electronAPI.timeclock.getPolicy(tenantId),
    ]);

    if (employeesRes.ok) setEmployees(employeesRes.data);
    if (liveRes.ok) setLiveBoard(liveRes.data);
    if (shiftsRes.ok) setShifts(shiftsRes.data);
    if (exceptionsRes.ok) setExceptions(exceptionsRes.data);
    if (summaryRes.ok) setSummary(summaryRes.data);
    if (alertsRes.ok) setAlerts(alertsRes.data);
    if (policyRes.ok) setPolicy(policyRes.data);
  }

  useEffect(() => {
    loadCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, dayFilter, period.start, period.end]);

  async function createEmployee(event) {
    event.preventDefault();
    const result = await window.electronAPI.timeclock.createEmployee({ tenantId, ...employeeForm });
    if (!result.ok) {
      setMessage(result.error || "Failed to create employee.");
      return;
    }
    setMessage("Employee created.");
    setEmployeeForm({ fullName: "", email: "", role: "staff", location: "" });
    await loadCore();
  }

  async function createTimeEvent(event) {
    event.preventDefault();
    const result = await window.electronAPI.timeclock.createEvent({
      tenantId,
      employeeId: Number(eventForm.employeeId),
      eventType: eventForm.eventType,
      occurredAt: eventForm.occurredAt,
      source: "manager",
      reason: eventForm.reason,
      createdBy: "manager",
    });
    if (!result.ok) {
      setMessage(result.error || "Failed to create time event.");
      return;
    }
    setMessage("Time event recorded.");
    await loadCore();
  }

  async function createShift(event) {
    event.preventDefault();
    const result = await window.electronAPI.timeclock.createShift({
      tenantId,
      employeeId: Number(shiftForm.employeeId),
      startAt: shiftForm.startAt,
      endAt: shiftForm.endAt,
      location: shiftForm.location,
      role: shiftForm.role,
    });
    if (!result.ok) {
      setMessage(result.error || "Failed to create shift.");
      return;
    }
    setMessage("Shift created.");
    await loadCore();
  }

  async function syncAlerts() {
    const result = await window.electronAPI.timeclock.syncAlerts({ tenantId, day: dayFilter });
    if (!result.ok) {
      setMessage(result.error || "Failed to sync alerts.");
      return;
    }
    setMessage(`Alerts synced. New alerts: ${result.data.created}`);
    await loadCore();
  }

  async function resolveAlert(alertId) {
    const result = await window.electronAPI.timeclock.resolveAlert({ tenantId, alertId });
    if (!result.ok) {
      setMessage(result.error || "Failed to resolve alert.");
      return;
    }
    await loadCore();
  }

  async function approveSummary(employeeId, status) {
    const result = await window.electronAPI.timeclock.approveTimesheet({
      tenantId,
      employeeId,
      periodStart: period.start,
      periodEnd: period.end,
      status,
      approvedBy: "manager",
    });
    if (!result.ok) {
      setMessage(result.error || "Failed to update timesheet status.");
      return;
    }
    await loadCore();
  }

  async function savePolicy(event) {
    event.preventDefault();
    const result = await window.electronAPI.timeclock.updatePolicy({
      tenantId,
      overtimeDailyHours: Number(policy.overtime_daily_hours),
      overtimeWeeklyHours: Number(policy.overtime_weekly_hours),
      maxBreakMinutes: Number(policy.max_break_minutes),
      lateToleranceMinutes: Number(policy.late_tolerance_minutes),
      earlyClockInMinutes: Number(policy.early_clock_in_minutes),
      geofenceRequired: Boolean(policy.geofence_required),
    });
    if (!result.ok) {
      setMessage(result.error || "Failed to update policy.");
      return;
    }
    setMessage("Policy updated.");
    await loadCore();
  }

  async function loadExport() {
    const result = await window.electronAPI.timeclock.exportCsv({
      tenantId,
      periodStart: period.start,
      periodEnd: period.end,
    });
    if (!result.ok) {
      setMessage(result.error || "Failed to export CSV.");
      return;
    }
    setCsvExport(result.data);
  }

  return (
    <section className="timeclock-shell">
      <header className="inventory-header">
        <h2>Employee Timeclock (Manager)</h2>
        <div className="inventory-header-right">
          <input type="date" value={dayFilter} onChange={(event) => setDayFilter(event.target.value)} />
          <button type="button" onClick={syncAlerts}>
            Sync Alerts
          </button>
        </div>
      </header>

      {message ? <p className="message">{message}</p> : null}

      <div className="timeclock-grid">
        <section className="card">
          <h3>Employees</h3>
          <form className="form" onSubmit={createEmployee}>
            <input
              placeholder="Full Name"
              value={employeeForm.fullName}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, fullName: event.target.value }))}
              required
            />
            <input
              placeholder="Email"
              type="email"
              value={employeeForm.email}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
            <input
              placeholder="Role"
              value={employeeForm.role}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, role: event.target.value }))}
            />
            <input
              placeholder="Location"
              value={employeeForm.location}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, location: event.target.value }))}
            />
            <button type="submit">Add Employee</button>
          </form>
          <div className="mini-list">
            {employees.map((employee) => (
              <p key={employee.id}>
                {employee.full_name} ({employee.role})
              </p>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Manager Override Clock Event</h3>
          <form className="form" onSubmit={createTimeEvent}>
            <select
              value={eventForm.employeeId}
              onChange={(event) => setEventForm((prev) => ({ ...prev, employeeId: event.target.value }))}
              required
            >
              <option value="">Select Employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
            <select
              value={eventForm.eventType}
              onChange={(event) => setEventForm((prev) => ({ ...prev, eventType: event.target.value }))}
            >
              <option value="clock_in">Clock In</option>
              <option value="clock_out">Clock Out</option>
              <option value="break_start">Break Start</option>
              <option value="break_end">Break End</option>
            </select>
            <input
              type="datetime-local"
              value={eventForm.occurredAt.slice(0, 16)}
              onChange={(event) =>
                setEventForm((prev) => ({ ...prev, occurredAt: new Date(event.target.value).toISOString() }))
              }
            />
            <input
              placeholder="Reason"
              value={eventForm.reason}
              onChange={(event) => setEventForm((prev) => ({ ...prev, reason: event.target.value }))}
            />
            <button type="submit">Apply Override</button>
          </form>
        </section>

        <section className="card">
          <h3>Live Attendance Board</h3>
          <div className="mini-list">
            {liveBoard.length === 0 ? <p>No active status records yet.</p> : null}
            {liveBoard.map((row) => (
              <p key={row.employee_id}>
                {row.full_name}: <strong>{row.status}</strong>
              </p>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Scheduling</h3>
          <form className="form" onSubmit={createShift}>
            <select
              value={shiftForm.employeeId}
              onChange={(event) => setShiftForm((prev) => ({ ...prev, employeeId: event.target.value }))}
              required
            >
              <option value="">Select Employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={shiftForm.startAt.slice(0, 16)}
              onChange={(event) =>
                setShiftForm((prev) => ({ ...prev, startAt: new Date(event.target.value).toISOString() }))
              }
              required
            />
            <input
              type="datetime-local"
              value={shiftForm.endAt.slice(0, 16)}
              onChange={(event) =>
                setShiftForm((prev) => ({ ...prev, endAt: new Date(event.target.value).toISOString() }))
              }
              required
            />
            <input
              placeholder="Location"
              value={shiftForm.location}
              onChange={(event) => setShiftForm((prev) => ({ ...prev, location: event.target.value }))}
            />
            <button type="submit">Publish Shift</button>
          </form>
          <div className="mini-list">
            {shifts.map((shift) => (
              <p key={shift.id}>
                {employeeNameById.get(shift.employee_id) || shift.employee_id}: {shift.start_at.slice(0, 16)} to{" "}
                {shift.end_at.slice(0, 16)}
              </p>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Exceptions</h3>
          <div className="mini-list">
            {exceptions.length === 0 ? <p>No exceptions detected for selected day.</p> : null}
            {exceptions.map((item, index) => (
              <p key={`${item.type}-${index}`}>
                [{item.type}] Employee {item.employee_id}: {item.message}
              </p>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Alerts</h3>
          <div className="mini-list">
            {alerts.length === 0 ? <p>No alerts.</p> : null}
            {alerts.map((alert) => (
              <p key={alert.id}>
                {alert.alert_type}: {alert.message}{" "}
                {alert.resolved ? (
                  <em>(resolved)</em>
                ) : (
                  <button type="button" onClick={() => resolveAlert(alert.id)}>
                    Resolve
                  </button>
                )}
              </p>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Timesheet Approval</h3>
          <div className="inline-period">
            <input
              type="datetime-local"
              value={period.start.slice(0, 16)}
              onChange={(event) => setPeriod((prev) => ({ ...prev, start: new Date(event.target.value).toISOString() }))}
            />
            <input
              type="datetime-local"
              value={period.end.slice(0, 16)}
              onChange={(event) => setPeriod((prev) => ({ ...prev, end: new Date(event.target.value).toISOString() }))}
            />
          </div>
          <div className="mini-list">
            {summary.map((row) => (
              <p key={row.employee_id}>
                {row.full_name}: {row.hours}h ({row.status}){" "}
                <button type="button" onClick={() => approveSummary(row.employee_id, "approved")}>
                  Approve
                </button>{" "}
                <button type="button" onClick={() => approveSummary(row.employee_id, "rejected")}>
                  Reject
                </button>
              </p>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Policy Controls</h3>
          <form className="form" onSubmit={savePolicy}>
            <label>Daily OT Hours</label>
            <input
              type="number"
              value={policy.overtime_daily_hours}
              onChange={(event) => setPolicy((prev) => ({ ...prev, overtime_daily_hours: event.target.value }))}
            />
            <label>Weekly OT Hours</label>
            <input
              type="number"
              value={policy.overtime_weekly_hours}
              onChange={(event) => setPolicy((prev) => ({ ...prev, overtime_weekly_hours: event.target.value }))}
            />
            <label>Max Break Minutes</label>
            <input
              type="number"
              value={policy.max_break_minutes}
              onChange={(event) => setPolicy((prev) => ({ ...prev, max_break_minutes: event.target.value }))}
            />
            <label>Late Tolerance Minutes</label>
            <input
              type="number"
              value={policy.late_tolerance_minutes}
              onChange={(event) => setPolicy((prev) => ({ ...prev, late_tolerance_minutes: event.target.value }))}
            />
            <label>Early Clock In Minutes</label>
            <input
              type="number"
              value={policy.early_clock_in_minutes}
              onChange={(event) => setPolicy((prev) => ({ ...prev, early_clock_in_minutes: event.target.value }))}
            />
            <label className="inline-check">
              <input
                type="checkbox"
                checked={Boolean(policy.geofence_required)}
                onChange={(event) => setPolicy((prev) => ({ ...prev, geofence_required: event.target.checked }))}
              />
              Geofence Required
            </label>
            <button type="submit">Save Policy</button>
          </form>
        </section>

        <section className="card">
          <h3>Payroll Export (CSV)</h3>
          <button type="button" onClick={loadExport}>
            Generate Export
          </button>
          {csvExport ? <textarea readOnly value={csvExport} rows={8} /> : <p>No export generated yet.</p>}
        </section>
      </div>
    </section>
  );
}
