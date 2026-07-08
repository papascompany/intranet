import { useState } from "react";
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
  auditLogs as seedAuditLogs,
  attendanceRecords as seedAttendanceRecords,
  corrections,
  earlyLeaveLedger,
  employees,
  leaveRequests,
  overtimeRequests,
  payrollStatements,
  workplaces
} from "./domain/seed";
import type { AttendanceRecord, ClockType, Employee, VerificationMethod } from "./domain/types";
import { buildAttendanceRecord, evaluateVerification } from "./domain/attendance";
import { getLeaveBalance } from "./domain/leave";
import { offsetOvertimeWithEarlyLeave } from "./domain/overtime";

const today = "2026-07-08T08:02:00+09:00";

const statusLabels = {
  GPS_PASSED: "GPS 정상",
  GPS_FAILED_ALLOWED: "GPS수신실패+수동클릭",
  GPS_FAILED_QR_ALLOWED: "GPS수신실패+QR",
  OUT_OF_RANGE: "반경 밖",
  MANUAL_REVIEW_REQUIRED: "관리자 검토"
};

const correctionLabels = {
  APPROVED_LATE: "인정지각",
  APPROVED_EARLY_LEAVE: "인정조퇴",
  CLOCK_IN_CORRECTION: "출근시각 보정",
  CLOCK_OUT_CORRECTION: "퇴근시각 보정",
  MISSING_RECORD_CREATED: "누락 기록 추가"
};

function App() {
  const [mode, setMode] = useState<"employee" | "admin">("employee");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("emp-ops-1");
  const [records, setRecords] = useState<AttendanceRecord[]>(seedAttendanceRecords);
  const [notice, setNotice] = useState("운영팀 파일럿 데이터가 준비되었습니다.");

  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? employees[1];
  const selectedRecord = records.find(
    (record) => record.employeeId === selectedEmployee.id && record.date === today.slice(0, 10)
  );
  const balance = getLeaveBalance({
    employee: selectedEmployee,
    asOf: today,
    approvedRequests: leaveRequests
  });
  const earlyLeaveMinutes = earlyLeaveLedger
    .filter((entry) => entry.employeeId === selectedEmployee.id)
    .reduce((sum, entry) => sum + entry.minutes, 0);
  const overtime = overtimeRequests.find((request) => request.employeeId === selectedEmployee.id);
  const offset = overtime
    ? offsetOvertimeWithEarlyLeave({
        date: overtime.date,
        earlyLeaveMinutes,
        overtimeMinutes: overtime.minutes,
        payApproved: overtime.payApproved
      })
    : undefined;

  function clock(type: ClockType, method: VerificationMethod, gpsError = false) {
    const now =
      type === "CLOCK_IN"
        ? "2026-07-08T08:02:00+09:00"
        : method === "GPS"
          ? "2026-07-08T16:42:00+09:00"
          : "2026-07-08T16:48:00+09:00";
    const verification = evaluateVerification({
      employeeId: selectedEmployee.id,
      workplaces,
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
    const nextRecord = buildAttendanceRecord({
      employeeId: selectedEmployee.id,
      type,
      verification,
      existing: selectedRecord,
      now
    });

    setRecords((current) => [nextRecord, ...current.filter((record) => record.id !== nextRecord.id)]);
    setNotice(`${selectedEmployee.name} ${type === "CLOCK_IN" ? "출근" : "퇴근"}: ${statusLabels[verification.status]}`);
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
              <select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
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
              employee={selectedEmployee}
              record={selectedRecord}
              balance={balance}
              earlyLeaveMinutes={earlyLeaveMinutes}
              offset={offset}
              onClock={clock}
            />
          ) : (
            <AdminView records={records} selectedEmployee={selectedEmployee} />
          )}
        </section>
      </main>
    </div>
  );
}

function EmployeeView(props: {
  employee: Employee;
  record?: AttendanceRecord;
  balance: ReturnType<typeof getLeaveBalance>;
  earlyLeaveMinutes: number;
  offset?: ReturnType<typeof offsetOvertimeWithEarlyLeave>;
  onClock: (type: ClockType, method: VerificationMethod, gpsError?: boolean) => void;
}) {
  const payroll = payrollStatements.find((statement) => statement.employeeId === props.employee.id);
  const pendingLeave = leaveRequests.find(
    (request) => request.employeeId === props.employee.id && request.status === "PENDING"
  );

  return (
    <div className="employee-grid">
      <section className="clock-panel">
        <div className="panel-title">
          <Fingerprint size={18} />
          <span>{props.employee.name}</span>
        </div>
        <div className="time-row">
          <div>
            <span>출근</span>
            <strong>{formatTime(props.record?.clockInAt)}</strong>
          </div>
          <div>
            <span>퇴근</span>
            <strong>{formatTime(props.record?.clockOutAt)}</strong>
          </div>
        </div>
        <div className="action-grid">
          <button className="primary-action" onClick={() => props.onClock("CLOCK_IN", "GPS")}>
            <MapPin size={18} />
            출근
          </button>
          <button className="primary-action" onClick={() => props.onClock("CLOCK_OUT", "GPS")}>
            <Clock size={18} />
            퇴근
          </button>
          <button className="secondary-action" onClick={() => props.onClock("CLOCK_IN", "QR", true)}>
            <QrCode size={18} />
            QR 출근
          </button>
          <button className="secondary-action" onClick={() => props.onClock("CLOCK_OUT", "MANUAL_CLICK", true)}>
            <TimerReset size={18} />
            GPS 실패 퇴근
          </button>
        </div>
        <p className="status-line">{props.record ? statusLabels[props.record.status] : "오늘 기록 없음"}</p>
      </section>

      <section className="metric-strip">
        <Metric icon={<CalendarDays size={18} />} label="사용 가능 휴가" value={`${props.balance.availableDays}일`} />
        <Metric icon={<ListChecks size={18} />} label="선사용 잔여" value={`${props.balance.advanceGrantedDays - props.balance.advanceUsedDays}일`} />
        <Metric icon={<TimerReset size={18} />} label="조기퇴근 누계" value={`${props.earlyLeaveMinutes}분`} />
        <Metric icon={<BadgeCheck size={18} />} label="상계 예정" value={`${props.offset?.appliedMinutes ?? 0}분`} />
      </section>

      <section className="list-section">
        <div className="section-heading">
          <h3>신청 현황</h3>
          <button className="pill-button">신청</button>
        </div>
        <DataRow label="휴가" value={pendingLeave ? `${pendingLeave.reason} · ${pendingLeave.days}일` : "대기 없음"} meta={pendingLeave?.status ?? "READY"} />
        <DataRow label="야근" value={props.offset ? `${props.offset.remainingOvertimeMinutes}분 잔여` : "승인 내역 없음"} meta={props.offset?.status ?? "EMPTY"} />
        <DataRow label="급여명세서" value={payroll?.filename ?? "업로드 대기"} meta={payroll?.month ?? "WAIT"} />
      </section>
    </div>
  );
}

function AdminView(props: { records: AttendanceRecord[]; selectedEmployee: Employee }) {
  const pilotEmployees = employees.filter((employee) => employee.pilot);
  const gpsFailed = props.records.filter((record) => record.status.includes("GPS_FAILED"));
  const selectedCorrections = corrections.filter((correction) => correction.employeeId === props.selectedEmployee.id);

  return (
    <div className="admin-grid">
      <section className="metric-strip admin-metrics">
        <Metric icon={<ShieldCheck size={18} />} label="파일럿 인원" value={`${pilotEmployees.length}명`} />
        <Metric icon={<MapPin size={18} />} label="GPS 실패 허용" value={`${gpsFailed.length}건`} />
        <Metric icon={<ListChecks size={18} />} label="승인 대기" value={`${leaveRequests.filter((request) => request.status === "PENDING").length}건`} />
        <Metric icon={<Upload size={18} />} label="급여 파일" value={`${payrollStatements.length}개`} />
      </section>

      <section className="list-section">
        <div className="section-heading">
          <h3>출퇴근 인증 내역</h3>
          <button className="pill-button">CSV</button>
        </div>
        {props.records.slice(0, 5).map((record) => {
          const employee = employees.find((item) => item.id === record.employeeId);
          return (
            <DataRow
              key={record.id}
              label={employee?.name ?? record.employeeId}
              value={`${formatTime(record.clockInAt)} / ${formatTime(record.clockOutAt)}`}
              meta={statusLabels[record.status]}
            />
          );
        })}
      </section>

      <section className="list-section">
        <div className="section-heading">
          <h3>보정·감사 로그</h3>
          <button className="pill-button">보정</button>
        </div>
        {selectedCorrections.map((correction) => (
          <DataRow
            key={correction.id}
            label={correctionLabels[correction.type]}
            value={correction.reason}
            meta={formatTime(correction.createdAt)}
          />
        ))}
        {seedAuditLogs.slice(0, 2).map((log) => (
          <DataRow key={log.id} label={log.action} value={log.detail} meta={formatTime(log.createdAt)} />
        ))}
      </section>

      <section className="list-section payroll-panel">
        <div className="section-heading">
          <h3>급여명세서</h3>
          <button className="pill-button">
            <FileText size={14} />
            업로드
          </button>
        </div>
        {payrollStatements.map((statement) => {
          const employee = employees.find((item) => item.id === statement.employeeId);
          return (
            <DataRow
              key={statement.id}
              label={employee?.name ?? statement.employeeId}
              value={statement.filename}
              meta={statement.month}
            />
          );
        })}
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

function formatTime(value?: string) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

export default App;
