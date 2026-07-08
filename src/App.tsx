import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Clock,
  FileText,
  Fingerprint,
  ListChecks,
  MapPin,
  QrCode,
  ShieldCheck,
  TimerReset,
  Upload
} from "lucide-react";
import {
  clockAttendance,
  createAttendanceCorrection,
  getDashboard,
  getEmployeeSnapshot,
  getEmployees,
  setOvertimePayApproval,
  softDeletePayrollStatement,
  submitLeaveRequest,
  submitOvertimeRequest,
  updateRequestStatus,
  uploadPayrollStatement
} from "./api/hrApi";
import type { Dashboard, EmployeeSnapshot } from "./api/types";
import type { ClockType, Employee, VerificationMethod } from "./domain/types";
import { buildAdminViewModel, type AdminDashboardResponse, type AdminViewModel } from "./features/adminViewModel";
import { buildEmployeeViewModel, type EmployeeViewModel } from "./features/employeeViewModel";

const today = "2026-07-08T08:02:00+09:00";

function App() {
  const [mode, setMode] = useState<"employee" | "admin">("employee");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("emp-ops-1");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [employeeSnapshot, setEmployeeSnapshot] = useState<EmployeeSnapshot | null>(null);
  const [notice, setNotice] = useState("운영팀 파일럿 API/DB 계층이 준비되었습니다.");
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async (employeeId = selectedEmployeeId) => {
    setIsLoading(true);
    const [nextEmployees, nextDashboard, nextSnapshot] = await Promise.all([
      getEmployees(),
      getDashboard(today),
      getEmployeeSnapshot(employeeId, today)
    ]);

    setEmployees(nextEmployees);
    setDashboard(nextDashboard);
    setEmployeeSnapshot(nextSnapshot);
    setIsLoading(false);
  }, [selectedEmployeeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedEmployee = employeeSnapshot?.employee ?? employees.find((employee) => employee.id === selectedEmployeeId);
  const employeeViewModel = useMemo(
    () => (employeeSnapshot ? buildEmployeeViewModel(toEmployeeViewModelSnapshot(employeeSnapshot)) : null),
    [employeeSnapshot]
  );
  const adminViewModel = useMemo(
    () =>
      dashboard && employeeSnapshot
        ? buildAdminViewModel(toAdminDashboardResponse(dashboard, employeeSnapshot, employees), selectedEmployeeId)
        : null,
    [dashboard, employeeSnapshot, employees, selectedEmployeeId]
  );

  async function handleEmployeeChange(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    await refresh(employeeId);
  }

  async function clock(type: ClockType, method: VerificationMethod, gpsError = false) {
    if (!selectedEmployee) {
      return;
    }

    const now =
      type === "CLOCK_IN"
        ? "2026-07-08T08:02:00+09:00"
        : method === "GPS"
          ? "2026-07-08T16:42:00+09:00"
          : "2026-07-08T16:48:00+09:00";
    const result = await clockAttendance({
      employeeId: selectedEmployee.id,
      type,
      method,
      now,
      gpsError,
      coordinate: gpsError
        ? undefined
        : {
            latitude: 37.5667,
            longitude: 126.9782,
            accuracyMeters: 18
          }
    });

    setNotice(`${selectedEmployee.name} ${type === "CLOCK_IN" ? "출근" : "퇴근"} 처리 · ${result.verification.status}`);
    await refresh(selectedEmployee.id);
  }

  async function submitLeave() {
    if (!selectedEmployee) {
      return;
    }

    const result = await submitLeaveRequest({
      employeeId: selectedEmployee.id,
      type: "HALF_DAY",
      startsOn: "2026-07-15",
      endsOn: "2026-07-15",
      days: 0.5,
      reason: "오후 개인 일정",
      actorId: selectedEmployee.id
    });

    setNotice(`${selectedEmployee.name} 휴가 신청 생성 · ${result.request.status}`);
    await refresh(selectedEmployee.id);
  }

  async function submitOvertime() {
    if (!selectedEmployee) {
      return;
    }

    const result = await submitOvertimeRequest({
      employeeId: selectedEmployee.id,
      date: "2026-07-16",
      startsAt: "2026-07-16T17:30:00+09:00",
      endsAt: "2026-07-16T19:00:00+09:00",
      minutes: 90,
      reason: "운영 마감 지원",
      actorId: selectedEmployee.id
    });

    setNotice(`${selectedEmployee.name} 야근 신청 생성 · ${result.request.status}`);
    await refresh(selectedEmployee.id);
  }

  async function approveLeave(requestId?: string) {
    if (!requestId) {
      setNotice("승인할 휴가 신청이 없습니다.");
      return;
    }

    const result = await updateRequestStatus({
      targetType: "LeaveRequest",
      requestId,
      status: "APPROVED",
      actorId: "emp-ceo",
      detail: "관리자 화면에서 휴가 승인"
    });

    setNotice(`휴가 신청 승인 · ${result.request.id}`);
    await refresh(selectedEmployeeId);
  }

  async function approveOvertime(requestId?: string) {
    if (!requestId) {
      setNotice("승인할 야근 신청이 없습니다.");
      return;
    }

    await updateRequestStatus({
      targetType: "OvertimeRequest",
      requestId,
      status: "APPROVED",
      actorId: "emp-ceo",
      detail: "관리자 화면에서 야근 승인"
    });
    const result = await setOvertimePayApproval({
      requestId,
      payApproved: true,
      actorId: "emp-ceo",
      detail: "관리자 인정 초과근무수당 집계"
    });

    setNotice(`야근 승인 및 수당 인정 · ${result.request.id}`);
    await refresh(selectedEmployeeId);
  }

  async function createCorrection() {
    if (!selectedEmployee || !employeeSnapshot?.todayAttendance) {
      setNotice("보정할 오늘 출퇴근 기록이 없습니다.");
      return;
    }

    const result = await createAttendanceCorrection({
      attendanceId: employeeSnapshot.todayAttendance.id,
      employeeId: selectedEmployee.id,
      correctedById: "emp-ceo",
      type: "APPROVED_LATE",
      beforeValue: employeeSnapshot.todayAttendance.clockInAt,
      afterValue: "2026-07-08T08:00:00+09:00",
      reason: "API 계층 보정 데모",
      createdAt: "2026-07-08T09:00:00+09:00"
    });

    setNotice(`${selectedEmployee.name} 보정 생성 · ${result.correction.type}`);
    await refresh(selectedEmployee.id);
  }

  async function uploadPayroll() {
    if (!selectedEmployee) {
      return;
    }

    const result = await uploadPayrollStatement({
      employeeId: selectedEmployee.id,
      month: "2026-07",
      filename: `2026-07-payroll-${selectedEmployee.id}.pdf`,
      actorId: "emp-ceo",
      uploadedAt: "2026-07-08T11:00:00+09:00"
    });

    setNotice(`${selectedEmployee.name} 급여명세서 업로드 · ${result.statement.month}`);
    await refresh(selectedEmployee.id);
  }

  async function deletePayroll(statementId?: string) {
    if (!statementId) {
      setNotice("삭제할 급여명세서가 없습니다.");
      return;
    }

    const result = await softDeletePayrollStatement({
      statementId,
      actorId: "emp-ceo",
      deletedAt: "2026-07-08T12:00:00+09:00"
    });

    setNotice(`급여명세서 삭제 처리 · ${result.statement.month}`);
    await refresh(selectedEmployeeId);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Internal HR Pilot</p>
          <h1>사내 근태 관리</h1>
        </div>
        <nav className="segmented" aria-label="화면 전환">
          <button className={mode === "employee" ? "active" : ""} onClick={() => setMode("employee")}>
            직원
          </button>
          <button className={mode === "admin" ? "active" : ""} onClick={() => setMode("admin")}>
            관리자
          </button>
        </nav>
      </header>

      <main>
        <section className="workspace-band">
          <div className="workspace-head">
            <div>
              <h2>{mode === "employee" ? "오늘의 업무" : "운영팀 파일럿"}</h2>
              <p>{notice}</p>
            </div>
            <label className="select-label">
              직원
              <select value={selectedEmployeeId} onChange={(event) => void handleEmployeeChange(event.target.value)}>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} · {employee.department}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {mode === "employee" ? (
            <EmployeeView
              viewModel={employeeViewModel}
              isLoading={isLoading}
              onClock={clock}
              onSubmitLeave={submitLeave}
              onSubmitOvertime={submitOvertime}
            />
          ) : (
            <AdminView
              viewModel={adminViewModel}
              isLoading={isLoading}
              selectedEmployee={selectedEmployee}
              onApproveLeave={approveLeave}
              onApproveOvertime={approveOvertime}
              onCreateCorrection={createCorrection}
              onUploadPayroll={uploadPayroll}
              onDeletePayroll={deletePayroll}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function EmployeeView(props: {
  viewModel: EmployeeViewModel | null;
  isLoading: boolean;
  onClock: (type: ClockType, method: VerificationMethod, gpsError?: boolean) => void;
  onSubmitLeave: () => void;
  onSubmitOvertime: () => void;
}) {
  const viewModel = props.viewModel;

  return (
    <div className="employee-grid">
      <section className="clock-panel">
        <div className="panel-title">
          <Fingerprint size={18} />
          <span>{props.isLoading ? "API 동기화 중" : "직원 셀프서비스"}</span>
        </div>
        <div className="time-row">
          <div>
            <span>출근</span>
            <strong>{viewModel?.clockInLabel ?? "--:--"}</strong>
          </div>
          <div>
            <span>퇴근</span>
            <strong>{viewModel?.clockOutLabel ?? "--:--"}</strong>
          </div>
        </div>
        <div className="action-grid">
          <button className="primary-action" disabled={props.isLoading} onClick={() => props.onClock("CLOCK_IN", "GPS")}>
            <MapPin size={18} />
            출근
          </button>
          <button className="primary-action" disabled={props.isLoading} onClick={() => props.onClock("CLOCK_OUT", "GPS")}>
            <Clock size={18} />
            퇴근
          </button>
          <button className="secondary-action" disabled={props.isLoading} onClick={() => props.onClock("CLOCK_IN", "QR", true)}>
            <QrCode size={18} />
            QR 출근
          </button>
          <button
            className="secondary-action"
            disabled={props.isLoading}
            onClick={() => props.onClock("CLOCK_OUT", "MANUAL_CLICK", true)}
          >
            <TimerReset size={18} />
            GPS 실패 퇴근
          </button>
        </div>
        <p className="status-line">{viewModel?.statusLabel ?? "API 데이터 준비 중"}</p>
      </section>

      <section className="metric-strip">
        <Metric
          icon={<CalendarDays size={18} />}
          label="사용 가능 휴가"
          value={stripMetricPrefix(viewModel?.leaveAvailableLabel, "사용 가능 연차")}
        />
        <Metric
          icon={<ListChecks size={18} />}
          label="선사용 현황"
          value={stripMetricPrefix(viewModel?.advanceLeaveLabel, "선사용 연차")}
        />
        <Metric
          icon={<TimerReset size={18} />}
          label="조기퇴근 누계"
          value={stripMetricPrefix(viewModel?.earlyLeaveLabel, "조퇴 누적")}
        />
        <Metric icon={<BadgeCheck size={18} />} label="상계 예정" value={viewModel?.offsetLabel ?? "-"} />
      </section>

      <section className="list-section">
        <div className="section-heading">
          <h3>신청 현황</h3>
          <div className="button-cluster">
            <button className="pill-button" disabled={props.isLoading} onClick={props.onSubmitLeave}>
              휴가
            </button>
            <button className="pill-button" disabled={props.isLoading} onClick={props.onSubmitOvertime}>
              야근
            </button>
          </div>
        </div>
        <DataRow label="휴가" value={viewModel?.pendingLeaveSummary ?? "로딩 중"} meta="API" />
        <DataRow label="야근 신청" value={viewModel?.pendingOvertimeSummary ?? "로딩 중"} meta="API" />
        <DataRow label="야근 상계" value={viewModel?.overtimeSummary ?? "로딩 중"} meta="OFFSET" />
        <DataRow label="급여명세서" value={viewModel?.payrollSummary ?? "로딩 중"} meta="PAYROLL" />
      </section>
    </div>
  );
}

function AdminView(props: {
  viewModel: AdminViewModel | null;
  isLoading: boolean;
  selectedEmployee?: Employee;
  onApproveLeave: (requestId?: string) => void;
  onApproveOvertime: (requestId?: string) => void;
  onCreateCorrection: () => void;
  onUploadPayroll: () => void;
  onDeletePayroll: (statementId?: string) => void;
}) {
  const firstLeaveRequestId = props.viewModel?.leaveRequestRows[0]?.id;
  const firstOvertimeRequestId = props.viewModel?.overtimeRows[0]?.id;

  return (
    <div className="admin-grid">
      <section className="metric-strip admin-metrics">
        <Metric icon={<ShieldCheck size={18} />} label="파일럿 인원" value={props.viewModel?.pilotCountLabel ?? "-"} />
        <Metric icon={<MapPin size={18} />} label="GPS 실패 허용" value={props.viewModel?.gpsFailedCountLabel ?? "-"} />
        <Metric icon={<ListChecks size={18} />} label="승인 대기" value={props.viewModel?.pendingRequestCountLabel ?? "-"} />
        <Metric icon={<Upload size={18} />} label="급여 파일" value={props.viewModel?.payrollCountLabel ?? "-"} />
      </section>

      <section className="list-section">
        <div className="section-heading">
          <h3>승인 대기</h3>
          <div className="button-cluster">
            <button className="pill-button" disabled={props.isLoading || !firstLeaveRequestId} onClick={() => props.onApproveLeave(firstLeaveRequestId)}>
              휴가 승인
            </button>
            <button
              className="pill-button"
              disabled={props.isLoading || !firstOvertimeRequestId}
              onClick={() => props.onApproveOvertime(firstOvertimeRequestId)}
            >
              야근 승인
            </button>
          </div>
        </div>
        {props.viewModel?.leaveRequestRows.slice(0, 3).map((row) => (
          <DataRow key={row.id} label={`휴가 · ${row.label}`} value={row.value} meta={row.meta} />
        ))}
        {props.viewModel?.overtimeRows.slice(0, 3).map((row) => (
          <DataRow key={row.id} label={`야근 · ${row.label}`} value={row.value} meta={row.meta} />
        ))}
        {!props.viewModel?.leaveRequestRows.length && !props.viewModel?.overtimeRows.length ? (
          <DataRow label="승인" value="대기 중인 신청이 없습니다." meta="EMPTY" />
        ) : null}
      </section>

      <section className="list-section">
        <div className="section-heading">
          <h3>출퇴근 인증 내역</h3>
          <button className="pill-button">CSV</button>
        </div>
        {props.viewModel?.attendanceRows.slice(0, 5).map((row) => (
          <DataRow key={row.id} label={row.label} value={row.value} meta={row.meta} />
        )) ?? <DataRow label="API" value="출퇴근 내역을 불러오는 중" meta="LOAD" />}
      </section>

      <section className="list-section">
        <div className="section-heading">
          <h3>보정·감사 로그</h3>
          <button className="pill-button" disabled={props.isLoading} onClick={props.onCreateCorrection}>
            보정
          </button>
        </div>
        {props.viewModel?.correctionRows.map((row) => (
          <DataRow key={row.id} label={row.label} value={row.value} meta={row.meta} />
        ))}
        {props.viewModel?.auditRows.slice(0, 2).map((row) => (
          <DataRow key={row.id} label={row.label} value={row.value} meta={row.meta} />
        )) ?? <DataRow label="API" value="감사 로그를 불러오는 중" meta="LOAD" />}
      </section>

      <section className="list-section payroll-panel">
        <div className="section-heading">
          <h3>급여명세서</h3>
          <div className="button-cluster">
            <button className="pill-button" disabled={props.isLoading || !props.selectedEmployee} onClick={props.onUploadPayroll}>
              <FileText size={14} />
              업로드
            </button>
            <button
              className="pill-button"
              disabled={props.isLoading || !props.viewModel?.payrollRows[0]?.id}
              onClick={() => props.onDeletePayroll(props.viewModel?.payrollRows[0]?.id)}
            >
              삭제
            </button>
          </div>
        </div>
        {props.viewModel?.payrollRows.map((row) => (
          <DataRow key={row.id} label={row.label} value={row.value} meta={row.meta} />
        )) ?? <DataRow label="API" value="급여명세서를 불러오는 중" meta="LOAD" />}
      </section>
    </div>
  );
}

function Metric(props: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span>{props.icon}</span>
      <p>{props.label}</p>
      <strong>{props.value}</strong>
    </div>
  );
}

function DataRow(props: { label: string; value: string; meta: string }) {
  return (
    <div className="data-row">
      <div>
        <strong>{props.label}</strong>
        <span>{props.value}</span>
      </div>
      <em>{props.meta}</em>
    </div>
  );
}

function toEmployeeViewModelSnapshot(snapshot: EmployeeSnapshot) {
  return {
    employee: snapshot.employee,
    attendanceToday: snapshot.todayAttendance ?? null,
    leaveBalance: snapshot.leaveBalance,
    leaveRequests: snapshot.leaveRequests,
    earlyLeaveTotalMinutes: snapshot.earlyLeaveLedger.reduce((sum, entry) => sum + entry.minutes, 0),
    overtimeOffset: snapshot.overtimeOffset ?? null,
    overtimeRequests: snapshot.overtimeRequests,
    payrollStatements: snapshot.payrollStatements
  };
}

function toAdminDashboardResponse(
  dashboard: Dashboard,
  employeeSnapshot: EmployeeSnapshot,
  employees: Employee[]
): AdminDashboardResponse {
  return {
    employees,
    attendanceRecords: dashboard.todayAttendance,
    leaveRequests: dashboard.leaveRequests,
    overtimeRequests: dashboard.overtimeRequests,
    corrections: dashboard.corrections,
    payrollStatements: dashboard.activePayrollStatements,
    auditLogs: dashboard.recentAuditLogs
  };
}

function stripMetricPrefix(value: string | undefined, prefix: string) {
  return value?.replace(prefix, "").trim() ?? "-";
}

export default App;
