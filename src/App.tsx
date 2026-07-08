import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  Clock,
  FileText,
  Fingerprint,
  History,
  LogIn,
  LogOut,
  ListChecks,
  MapPin,
  QrCode,
  Settings,
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
  updateSettings,
  updateRequestStatus,
  uploadPayrollStatement
} from "./api/hrApi";
import type { Dashboard, EmployeeSnapshot } from "./api/types";
import {
  DataTable,
  DetailPanel,
  EmptyState,
  ErpNavItem,
  ErpShell,
  InlineActions,
  KpiGrid,
  KpiTile,
  StatusPill,
  Toolbar,
  type DataTableColumn
} from "./components/erp";
import type { ClockType, Employee, VerificationMethod } from "./domain/types";
import { buildEmployeeViewModel, type EmployeeViewModel } from "./features/employeeViewModel";
import { buildEmployeeCardViewModel, type EmployeeCardRow } from "./features/employeeCardViewModel";
import {
  buildErpViewModel,
  type ErpActiveSection,
  type ErpViewModel,
  type ErpViewModelRow
} from "./features/erpViewModel";

const today = "2026-07-08T08:02:00+09:00";

const navIcons: Record<ErpActiveSection, React.ReactNode> = {
  "self-service": <Fingerprint size={16} />,
  "employee-card": <BadgeCheck size={16} />,
  attendance: <MapPin size={16} />,
  approvals: <ClipboardCheck size={16} />,
  leave: <CalendarDays size={16} />,
  overtime: <Clock size={16} />,
  payroll: <FileText size={16} />,
  settings: <Settings size={16} />,
  audit: <History size={16} />
};

type UserMode = "EMPLOYEE" | "ADMIN";

const employeeSections: ErpActiveSection[] = ["self-service", "employee-card", "attendance", "leave", "overtime", "payroll"];
const adminSections: ErpActiveSection[] = ["employee-card", "attendance", "approvals", "leave", "overtime", "payroll", "settings", "audit"];

const rowColumns: DataTableColumn<ErpViewModelRow>[] = [
  { key: "label", header: "대상", value: "label", width: "22%" },
  { key: "value", header: "내용", value: "value" },
  { key: "meta", header: "상태/메모", cell: (row) => <StatusPill tone={toneForStatus(row.status)}>{row.meta}</StatusPill>, width: "28%" }
];

const employeeCardColumns: DataTableColumn<EmployeeCardRow>[] = [
  { key: "label", header: "항목", value: "label", width: "24%" },
  { key: "value", header: "내용", value: "value" },
  {
    key: "scope",
    header: "권한",
    cell: (row) => (
      <StatusPill tone={row.adminOnly ? "warning" : row.sensitive ? "info" : "neutral"}>
        {row.adminOnly ? "관리자" : row.sensitive ? "민감" : "기본"}
      </StatusPill>
    ),
    width: "22%"
  }
];

function App() {
  const [activeSection, setActiveSection] = useState<ErpActiveSection>("self-service");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => localStorage.getItem("intranet:employee-id") ?? "emp-ops-1");
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem("intranet:remember-login") === "true");
  const [rememberLogin, setRememberLogin] = useState(() => localStorage.getItem("intranet:remember-login") === "true");
  const [userMode, setUserMode] = useState<UserMode>("EMPLOYEE");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [employeeSnapshot, setEmployeeSnapshot] = useState<EmployeeSnapshot | null>(null);
  const [notice, setNotice] = useState("운영팀 파일럿 API/DB 계층이 준비되었습니다.");
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(
    async (employeeId = selectedEmployeeId) => {
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
    },
    [selectedEmployeeId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedEmployee = employeeSnapshot?.employee ?? employees.find((employee) => employee.id === selectedEmployeeId);
  const isAdminAccount = isAdminEmployee(selectedEmployee);
  const effectiveMode: UserMode = userMode === "ADMIN" && isAdminAccount ? "ADMIN" : "EMPLOYEE";
  const allowedSections = effectiveMode === "ADMIN" ? adminSections : employeeSections;
  const employeeViewModel = useMemo(
    () => (employeeSnapshot ? buildEmployeeViewModel(toEmployeeViewModelSnapshot(employeeSnapshot)) : null),
    [employeeSnapshot]
  );
  const erpViewModel = useMemo(
    () =>
      dashboard && employeeSnapshot
        ? buildErpViewModel({ dashboard, employeeSnapshot, employees, activeSection })
        : null,
    [dashboard, employeeSnapshot, employees, activeSection]
  );
  const employeeCardRows = useMemo(
    () => (selectedEmployee ? buildEmployeeCardViewModel(selectedEmployee, effectiveMode) : []),
    [effectiveMode, selectedEmployee]
  );
  const visibleNavItems = useMemo(
    () => erpViewModel?.navItems.filter((item) => allowedSections.includes(item.section)) ?? [],
    [allowedSections, erpViewModel]
  );

  useEffect(() => {
    if (!allowedSections.includes(activeSection)) {
      setActiveSection(allowedSections[0]);
    }
  }, [activeSection, allowedSections]);

  useEffect(() => {
    if (userMode === "ADMIN" && selectedEmployee && !isAdminAccount) {
      setUserMode("EMPLOYEE");
      setNotice("관리자모드는 관리자 지정 계정만 사용할 수 있습니다.");
    }
  }, [isAdminAccount, selectedEmployee, userMode]);

  async function handleEmployeeChange(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    if (rememberLogin) {
      localStorage.setItem("intranet:employee-id", employeeId);
    }
    await refresh(employeeId);
  }

  function handleLogin() {
    if (rememberLogin) {
      localStorage.setItem("intranet:remember-login", "true");
      localStorage.setItem("intranet:employee-id", selectedEmployeeId);
    } else {
      localStorage.removeItem("intranet:remember-login");
      localStorage.removeItem("intranet:employee-id");
    }

    setIsLoggedIn(true);
    setNotice("로그인되었습니다. 직원모드에서 본인 업무를 시작합니다.");
  }

  function handleLogout() {
    localStorage.removeItem("intranet:remember-login");
    localStorage.removeItem("intranet:employee-id");
    setRememberLogin(false);
    setIsLoggedIn(false);
    setUserMode("EMPLOYEE");
    setActiveSection("self-service");
    setNotice("로그아웃되었습니다.");
  }

  function changeMode(nextMode: UserMode) {
    if (nextMode === "ADMIN" && !isAdminAccount) {
      setNotice("관리자 지정 계정만 관리자모드로 전환할 수 있습니다.");
      return;
    }

    setUserMode(nextMode);
    setActiveSection(nextMode === "ADMIN" ? "approvals" : "self-service");
    setNotice(nextMode === "ADMIN" ? "관리자모드로 전환했습니다." : "직원모드로 전환했습니다.");
  }

  async function clock(type: ClockType, method: VerificationMethod, gpsError = false) {
    if (!selectedEmployee) return;

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
      coordinate: gpsError ? undefined : { latitude: 37.5667, longitude: 126.9782, accuracyMeters: 18 }
    });

    setNotice(`${selectedEmployee.name} ${type === "CLOCK_IN" ? "출근" : "퇴근"} 처리 · ${result.verification.status}`);
    await refresh(selectedEmployee.id);
  }

  async function submitLeave() {
    if (!selectedEmployee) return;

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
    setActiveSection("approvals");
    await refresh(selectedEmployee.id);
  }

  async function submitOvertime() {
    if (!selectedEmployee) return;

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
    setActiveSection("approvals");
    await refresh(selectedEmployee.id);
  }

  async function approveLeave(requestId?: string, status: "APPROVED" | "REJECTED" = "APPROVED") {
    if (!requestId) {
      setNotice("처리할 휴가 신청이 없습니다.");
      return;
    }

    const result = await updateRequestStatus({
      targetType: "LeaveRequest",
      requestId,
      status,
      actorId: adminActorId(selectedEmployee),
      detail: `관리자 화면에서 휴가 ${status === "APPROVED" ? "승인" : "반려"}`
    });

    setNotice(`휴가 신청 ${status === "APPROVED" ? "승인" : "반려"} · ${result.request.id}`);
    await refresh(selectedEmployeeId);
  }

  async function approveOvertime(requestId?: string, status: "APPROVED" | "REJECTED" = "APPROVED") {
    if (!requestId) {
      setNotice("처리할 야근 신청이 없습니다.");
      return;
    }

    const result = await updateRequestStatus({
      targetType: "OvertimeRequest",
      requestId,
      status,
      actorId: adminActorId(selectedEmployee),
      detail: `관리자 화면에서 야근 ${status === "APPROVED" ? "승인" : "반려"}`
    });

    if (status === "APPROVED") {
      await setOvertimePayApproval({
        requestId,
        payApproved: true,
        actorId: adminActorId(selectedEmployee),
        detail: "관리자 인정 초과근무수당 집계"
      });
    }

    setNotice(`야근 신청 ${status === "APPROVED" ? "승인 및 수당 인정" : "반려"} · ${result.request.id}`);
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
      correctedById: adminActorId(selectedEmployee),
      type: "APPROVED_LATE",
      beforeValue: employeeSnapshot.todayAttendance.clockInAt,
      afterValue: "2026-07-08T08:00:00+09:00",
      reason: "관리자 인정지각 보정",
      createdAt: "2026-07-08T09:00:00+09:00"
    });

    setNotice(`${selectedEmployee.name} 보정 생성 · ${result.correction.type}`);
    await refresh(selectedEmployee.id);
  }

  async function uploadPayroll() {
    if (!selectedEmployee) return;

    const result = await uploadPayrollStatement({
      employeeId: selectedEmployee.id,
      month: "2026-07",
      filename: `2026-07-payroll-${selectedEmployee.id}.pdf`,
      actorId: adminActorId(selectedEmployee),
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
      actorId: adminActorId(selectedEmployee),
      deletedAt: "2026-07-08T12:00:00+09:00"
    });

    setNotice(`급여명세서 삭제 처리 · ${result.statement.month}`);
    await refresh(selectedEmployeeId);
  }

  async function updateGpsRadius(radius: number) {
    if (!selectedEmployee || !isAdminAccount) {
      setNotice("GPS 허용 반경은 관리자 지정 계정만 변경할 수 있습니다.");
      return;
    }

    const result = await updateSettings({
      actorId: selectedEmployee.id,
      settings: {
        gpsAllowedRadiusMeters: radius
      }
    });

    setNotice(`GPS 허용 반경 변경 · ${result.settings.gpsAllowedRadiusMeters}m`);
    await refresh(selectedEmployee.id);
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        employees={employees}
        isLoading={isLoading}
        onEmployeeChange={handleEmployeeChange}
        onLogin={handleLogin}
        onRememberChange={setRememberLogin}
        rememberLogin={rememberLogin}
        selectedEmployeeId={selectedEmployeeId}
      />
    );
  }

  return (
    <div className="app-shell">
      <ErpShell
        sidebar={
          visibleNavItems.map((item) => (
            <ErpNavItem
              active={item.isActive}
              badge={item.count}
              icon={navIcons[item.section]}
              key={item.section}
              onClick={() => setActiveSection(item.section)}
            >
              {item.label}
            </ErpNavItem>
          )) ?? <ErpNavItem active>로딩</ErpNavItem>
        }
        topbar={
          <>
            <div>
              <p className="eyebrow">Internal HR Pilot</p>
              <h1>사내 근태 관리</h1>
            </div>
            <div className="topbar-controls">
              <div className="segmented" aria-label="사용자 모드">
                <button className={effectiveMode === "EMPLOYEE" ? "active" : undefined} onClick={() => changeMode("EMPLOYEE")}>
                  직원모드
                </button>
                <button className={effectiveMode === "ADMIN" ? "active" : undefined} onClick={() => changeMode("ADMIN")}>
                  관리자모드
                </button>
              </div>
            <label className="select-label">
              계정
              <select value={selectedEmployeeId} onChange={(event) => void handleEmployeeChange(event.target.value)}>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} · {employee.department}
                  </option>
                ))}
              </select>
            </label>
              <button className="icon-button" onClick={handleLogout} title="로그아웃">
                <LogOut size={16} />
              </button>
            </div>
          </>
        }
      >
        <Toolbar
          title={sectionTitle(activeSection)}
          description={notice}
          actions={
            <InlineActions>
              <button disabled={isLoading} onClick={() => void refresh()}>
                새로고침
              </button>
            </InlineActions>
          }
        />

        {erpViewModel ? (
          <>
            <KpiGrid>
              {erpViewModel.kpis.map((kpi) => (
                <KpiTile icon={iconForKpi(kpi.id)} key={kpi.id} label={kpi.label} value={kpi.value} footer={kpi.meta} />
              ))}
            </KpiGrid>
            {renderSection({
              activeSection,
              employeeViewModel,
              erpViewModel,
              isLoading,
              onApproveLeave: approveLeave,
              onApproveOvertime: approveOvertime,
              onClock: clock,
              onCreateCorrection: createCorrection,
              onDeletePayroll: deletePayroll,
              onUpdateGpsRadius: updateGpsRadius,
              onSubmitLeave: submitLeave,
              onSubmitOvertime: submitOvertime,
              onUploadPayroll: uploadPayroll,
              canAdmin: effectiveMode === "ADMIN",
              employeeCardRows
            })}
          </>
        ) : (
          <EmptyState title="데이터를 불러오는 중" description="API/DB 계층에서 파일럿 데이터를 동기화하고 있습니다." />
        )}
      </ErpShell>
    </div>
  );
}

function renderSection(props: {
  activeSection: ErpActiveSection;
  canAdmin: boolean;
  employeeCardRows: EmployeeCardRow[];
  employeeViewModel: EmployeeViewModel | null;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onApproveLeave: (requestId?: string, status?: "APPROVED" | "REJECTED") => void;
  onApproveOvertime: (requestId?: string, status?: "APPROVED" | "REJECTED") => void;
  onClock: (type: ClockType, method: VerificationMethod, gpsError?: boolean) => void;
  onCreateCorrection: () => void;
  onDeletePayroll: (statementId?: string) => void;
  onUpdateGpsRadius: (radius: number) => void;
  onSubmitLeave: () => void;
  onSubmitOvertime: () => void;
  onUploadPayroll: () => void;
}) {
  switch (props.activeSection) {
    case "self-service":
      return <SelfServiceSection {...props} />;
    case "employee-card":
      return <EmployeeCardSection {...props} />;
    case "attendance":
      return <AttendanceSection {...props} />;
    case "approvals":
      return <ApprovalsSection {...props} />;
    case "leave":
      return <LeaveSection {...props} />;
    case "overtime":
      return <OvertimeSection {...props} />;
    case "payroll":
      return <PayrollSection {...props} />;
    case "settings":
      return <SettingsSection viewModel={props.erpViewModel} canAdmin={props.canAdmin} isLoading={props.isLoading} onUpdateGpsRadius={props.onUpdateGpsRadius} />;
    case "audit":
      return <AuditSection viewModel={props.erpViewModel} />;
  }
}

function LoginScreen(props: {
  employees: Employee[];
  isLoading: boolean;
  onEmployeeChange: (employeeId: string) => void;
  onLogin: () => void;
  onRememberChange: (remember: boolean) => void;
  rememberLogin: boolean;
  selectedEmployeeId: string;
}) {
  return (
    <div className="app-shell login-shell">
      <DetailPanel
        title="사내 근태 관리 로그인"
        description="계정을 선택하고 로그인 상태 유지 여부를 확인합니다."
        actions={
          <InlineActions>
            <button disabled={props.isLoading || props.employees.length === 0} onClick={props.onLogin}>
              <LogIn size={14} />
              로그인
            </button>
          </InlineActions>
        }
      >
        <div className="login-grid">
          <label className="select-label">
            계정
            <select value={props.selectedEmployeeId} onChange={(event) => void props.onEmployeeChange(event.target.value)}>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} · {employee.department} · {roleLabel(employee.role)}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              checked={props.rememberLogin}
              onChange={(event) => props.onRememberChange(event.target.checked)}
              type="checkbox"
            />
            로그인 상태 유지
          </label>
        </div>
      </DetailPanel>
    </div>
  );
}

function SelfServiceSection(props: {
  employeeViewModel: EmployeeViewModel | null;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onClock: (type: ClockType, method: VerificationMethod, gpsError?: boolean) => void;
  onSubmitLeave: () => void;
  onSubmitOvertime: () => void;
}) {
  const employee = props.erpViewModel.employeeSummary;

  return (
    <div className="erp-two-column">
      <DetailPanel
        title={`${employee.name} 셀프서비스`}
        description={`${employee.department} · ${employee.role} · ${employee.pilotLabel}`}
        actions={
          <InlineActions>
            <button disabled={props.isLoading} onClick={() => props.onClock("CLOCK_IN", "GPS")}>
              <MapPin size={14} />
              출근
            </button>
            <button disabled={props.isLoading} onClick={() => props.onClock("CLOCK_OUT", "GPS")}>
              <Clock size={14} />
              퇴근
            </button>
            <button disabled={props.isLoading} onClick={() => props.onClock("CLOCK_IN", "QR", true)}>
              <QrCode size={14} />
              QR
            </button>
            <button disabled={props.isLoading} onClick={() => props.onClock("CLOCK_OUT", "MANUAL_CLICK", true)}>
              <TimerReset size={14} />
              GPS 실패
            </button>
          </InlineActions>
        }
      >
        <KpiGrid minTileWidth="150px">
          <KpiTile label="출근" value={props.employeeViewModel?.clockInLabel ?? "--:--"} />
          <KpiTile label="퇴근" value={props.employeeViewModel?.clockOutLabel ?? "--:--"} />
          <KpiTile label="근태 상태" value={props.employeeViewModel?.statusLabel ?? "준비 중"} />
          <KpiTile label="상계" value={props.employeeViewModel?.offsetLabel ?? "-"} />
        </KpiGrid>
      </DetailPanel>

      <DetailPanel
        title="신청"
        description="직원 신청은 승인 대기 업무 큐로 이동합니다."
        actions={
          <InlineActions>
            <button disabled={props.isLoading} onClick={props.onSubmitLeave}>
              휴가 신청
            </button>
            <button disabled={props.isLoading} onClick={props.onSubmitOvertime}>
              야근 신청
            </button>
          </InlineActions>
        }
      >
        <DataTable
          columns={rowColumns}
          rows={[
            {
              id: "leave-summary",
              label: "휴가",
              value: props.employeeViewModel?.pendingLeaveSummary ?? "로딩 중",
              meta: props.employeeViewModel?.leaveAvailableLabel ?? "-",
              status: "PENDING"
            },
            {
              id: "overtime-summary",
              label: "야근",
              value: props.employeeViewModel?.pendingOvertimeSummary ?? "로딩 중",
              meta: props.employeeViewModel?.overtimeSummary ?? "-",
              status: "PENDING"
            },
            {
              id: "payroll-summary",
              label: "급여",
              value: props.employeeViewModel?.payrollSummary ?? "로딩 중",
              meta: "본인 명세서만 표시",
              status: "ACTIVE"
            }
          ]}
        />
      </DetailPanel>
    </div>
  );
}

function EmployeeCardSection(props: { canAdmin: boolean; employeeCardRows: EmployeeCardRow[]; erpViewModel: ErpViewModel }) {
  return (
    <DetailPanel
      title={`${props.erpViewModel.employeeSummary.name} 직원카드`}
      description={props.canAdmin ? "관리자 전용 급여·퇴직·소득공제·커스텀 항목까지 표시합니다." : "직원모드에서는 기본 인사카드 항목만 표시합니다."}
    >
      <DataTable columns={employeeCardColumns} rows={props.employeeCardRows} emptyState={<EmptyState title="직원카드 없음" />} />
    </DetailPanel>
  );
}

function AttendanceSection(props: { canAdmin: boolean; erpViewModel: ErpViewModel; isLoading: boolean; onCreateCorrection: () => void }) {
  const attendanceRows = filterRowsForMode(props.erpViewModel.attendanceRows, props.erpViewModel.employeeSummary.name, props.canAdmin);
  const correctionRows = filterRowsForMode(props.erpViewModel.correctionRows, props.erpViewModel.employeeSummary.name, props.canAdmin);

  return (
    <div className="erp-two-column">
      <DetailPanel
        title="출퇴근 인증 내역"
        description="GPS 실패 시 QR과 수동 클릭을 동등하게 허용하고 이력을 남깁니다."
        actions={
          props.canAdmin ? (
            <InlineActions>
              <button disabled={props.isLoading} onClick={props.onCreateCorrection}>
                인정지각 보정
              </button>
            </InlineActions>
          ) : undefined
        }
      >
        <DataTable columns={rowColumns} rows={attendanceRows} emptyState={<EmptyState title="기록 없음" />} />
      </DetailPanel>

      <DetailPanel title="보정 이력" description="원본 기록은 삭제하지 않고 보정 이력을 별도로 보존합니다.">
        <DataTable columns={rowColumns} rows={correctionRows} emptyState={<EmptyState title="보정 없음" />} />
      </DetailPanel>
    </div>
  );
}

function ApprovalsSection(props: {
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onApproveLeave: (requestId?: string, status?: "APPROVED" | "REJECTED") => void;
  onApproveOvertime: (requestId?: string, status?: "APPROVED" | "REJECTED") => void;
}) {
  const firstLeaveId = props.erpViewModel.leaveRows.find((row) => row.status === "PENDING")?.id;
  const firstOvertimeId = props.erpViewModel.overtimeRows.find((row) => row.status === "PENDING")?.id;

  return (
    <DetailPanel
      title="업무 큐"
      description="승인 대기, GPS 실패, 보정 확인이 한 화면에 모입니다."
      actions={
        <InlineActions>
          <button disabled={props.isLoading || !firstLeaveId} onClick={() => props.onApproveLeave(firstLeaveId)}>
            휴가 승인
          </button>
          <button disabled={props.isLoading || !firstLeaveId} onClick={() => props.onApproveLeave(firstLeaveId, "REJECTED")}>
            휴가 반려
          </button>
          <button disabled={props.isLoading || !firstOvertimeId} onClick={() => props.onApproveOvertime(firstOvertimeId)}>
            야근 승인
          </button>
          <button disabled={props.isLoading || !firstOvertimeId} onClick={() => props.onApproveOvertime(firstOvertimeId, "REJECTED")}>
            야근 반려
          </button>
        </InlineActions>
      }
    >
      <DataTable columns={rowColumns} rows={props.erpViewModel.workQueueRows} emptyState={<EmptyState title="처리할 업무 없음" />} />
    </DetailPanel>
  );
}

function LeaveSection(props: {
  canAdmin: boolean;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onSubmitLeave: () => void;
  onApproveLeave: (requestId?: string, status?: "APPROVED" | "REJECTED") => void;
}) {
  const leaveRows = filterRowsForMode(props.erpViewModel.leaveRows, props.erpViewModel.employeeSummary.name, props.canAdmin);
  const firstPendingId = leaveRows.find((row) => row.status === "PENDING")?.id;

  return (
    <DetailPanel
      title="휴가 장부"
      description="휴직/장기결근 예외는 자동 중단 없이 HR 보정으로 처리합니다."
      actions={
        <InlineActions>
          <button disabled={props.isLoading} onClick={props.onSubmitLeave}>
            반차 신청 생성
          </button>
          {props.canAdmin ? (
            <>
              <button disabled={props.isLoading || !firstPendingId} onClick={() => props.onApproveLeave(firstPendingId)}>
                승인
              </button>
              <button disabled={props.isLoading || !firstPendingId} onClick={() => props.onApproveLeave(firstPendingId, "REJECTED")}>
                반려
              </button>
            </>
          ) : null}
        </InlineActions>
      }
    >
      <DataTable columns={rowColumns} rows={leaveRows} emptyState={<EmptyState title="휴가 신청 없음" />} />
    </DetailPanel>
  );
}

function OvertimeSection(props: {
  canAdmin: boolean;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onSubmitOvertime: () => void;
  onApproveOvertime: (requestId?: string, status?: "APPROVED" | "REJECTED") => void;
}) {
  const overtimeRows = filterRowsForMode(props.erpViewModel.overtimeRows, props.erpViewModel.employeeSummary.name, props.canAdmin);
  const firstPendingId = overtimeRows.find((row) => row.status === "PENDING")?.id;

  return (
    <DetailPanel
      title="야근·상계"
      description="평달 야근은 조기퇴근 누적분과 상계하고, 관리자 인정분만 수당 집계 대상으로 표시합니다."
      actions={
        <InlineActions>
          <button disabled={props.isLoading} onClick={props.onSubmitOvertime}>
            야근 신청 생성
          </button>
          {props.canAdmin ? (
            <>
              <button disabled={props.isLoading || !firstPendingId} onClick={() => props.onApproveOvertime(firstPendingId)}>
                승인+수당인정
              </button>
              <button disabled={props.isLoading || !firstPendingId} onClick={() => props.onApproveOvertime(firstPendingId, "REJECTED")}>
                반려
              </button>
            </>
          ) : null}
        </InlineActions>
      }
    >
      <DataTable columns={rowColumns} rows={overtimeRows} emptyState={<EmptyState title="야근 신청 없음" />} />
    </DetailPanel>
  );
}

function PayrollSection(props: {
  canAdmin: boolean;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onUploadPayroll: () => void;
  onDeletePayroll: (statementId?: string) => void;
}) {
  const payrollRows = filterRowsForMode(props.erpViewModel.payrollRows, props.erpViewModel.employeeSummary.name, props.canAdmin);
  const firstPayrollId = payrollRows[0]?.id;

  return (
    <DetailPanel
      title="급여명세서"
      description={props.canAdmin ? "관리자는 명세서 업로드와 soft delete 삭제 처리를 수행합니다." : "직원은 본인 급여명세서 조회만 가능합니다."}
      actions={
        props.canAdmin ? (
          <InlineActions>
            <button disabled={props.isLoading} onClick={props.onUploadPayroll}>
              <Upload size={14} />
              업로드
            </button>
            <button disabled={props.isLoading || !firstPayrollId} onClick={() => props.onDeletePayroll(firstPayrollId)}>
              삭제
            </button>
          </InlineActions>
        ) : undefined
      }
    >
      <DataTable columns={rowColumns} rows={payrollRows} emptyState={<EmptyState title="급여명세서 없음" />} />
    </DetailPanel>
  );
}

function SettingsSection(props: {
  canAdmin: boolean;
  isLoading: boolean;
  onUpdateGpsRadius: (radius: number) => void;
  viewModel: ErpViewModel;
}) {
  const gpsRadius = Number(props.viewModel.decisionChecks.find((row) => row.id === "policy-gps-radius")?.value.match(/\d+/)?.[0] ?? 300);

  return (
    <div className="erp-two-column">
      <DetailPanel title="선택 직원" description="파일럿 적용 범위와 권한을 확인합니다.">
        <DataTable
          columns={rowColumns}
          rows={[
            { id: "employee-name", label: "이름", value: props.viewModel.employeeSummary.name, meta: props.viewModel.employeeSummary.department },
            { id: "employee-role", label: "권한", value: props.viewModel.employeeSummary.role, meta: props.viewModel.employeeSummary.pilotLabel },
            { id: "employee-hire", label: "입사일", value: props.viewModel.employeeSummary.hireDate, meta: "입사일 기준 연차" }
          ]}
        />
      </DetailPanel>
      <DetailPanel
        title="운영 정책"
        description="확정된 정책값입니다. GPS 반경은 관리자 지정 계정만 변경할 수 있습니다."
        actions={
          props.canAdmin ? (
            <InlineActions>
              <button disabled={props.isLoading || gpsRadius === 300} onClick={() => props.onUpdateGpsRadius(300)}>
                300m
              </button>
              <button disabled={props.isLoading || gpsRadius === 500} onClick={() => props.onUpdateGpsRadius(500)}>
                500m
              </button>
            </InlineActions>
          ) : undefined
        }
      >
        <DataTable columns={rowColumns} rows={props.viewModel.decisionChecks} />
      </DetailPanel>
    </div>
  );
}

function AuditSection({ viewModel }: { viewModel: ErpViewModel }) {
  return (
    <div className="erp-two-column">
      <DetailPanel title="감사 로그" description="민감 이벤트와 관리자 조작 이력을 추적합니다.">
        <DataTable columns={rowColumns} rows={viewModel.auditRows} emptyState={<EmptyState title="감사 로그 없음" />} />
      </DetailPanel>
      <DetailPanel title="보정 확인" description="보정 이력은 별도 행으로도 확인합니다.">
        <DataTable columns={rowColumns} rows={viewModel.correctionRows} emptyState={<EmptyState title="보정 없음" />} />
      </DetailPanel>
    </div>
  );
}

function toEmployeeViewModelSnapshot(snapshot: EmployeeSnapshot) {
  return {
    employee: snapshot.employee,
    attendanceToday: snapshot.todayAttendance ?? null,
    leaveBalance: snapshot.leaveBalance,
    leaveRequests: snapshot.leaveRequests,
    overtimeRequests: snapshot.overtimeRequests,
    earlyLeaveTotalMinutes: snapshot.earlyLeaveLedger.reduce((sum, entry) => sum + entry.minutes, 0),
    overtimeOffset: snapshot.overtimeOffset ?? null,
    payrollStatements: snapshot.payrollStatements
  };
}

function sectionTitle(section: ErpActiveSection) {
  const titles: Record<ErpActiveSection, string> = {
    "self-service": "직원 셀프서비스",
    "employee-card": "직원카드",
    attendance: "근태/보정",
    approvals: "승인 업무 큐",
    leave: "휴가/연차",
    overtime: "야근/상계",
    payroll: "급여명세서",
    settings: "설정/정책",
    audit: "감사 로그"
  };

  return titles[section];
}

function toneForStatus(status?: string) {
  if (!status) return "neutral";
  if (status.includes("FAILED") || status.includes("PENDING") || status === "DEFAULT") return "warning";
  if (status.includes("APPROVED") || status === "ACTIVE" || status === "GPS_PASSED") return "success";
  if (status.includes("REJECTED") || status === "DELETED") return "danger";
  return "info";
}

function iconForKpi(id: string) {
  if (id.includes("pilot")) return <ShieldCheck size={18} />;
  if (id.includes("gps")) return <MapPin size={18} />;
  if (id.includes("pending")) return <ListChecks size={18} />;
  if (id.includes("payroll")) return <FileText size={18} />;
  return <BadgeCheck size={18} />;
}

function filterRowsForMode(rows: ErpViewModelRow[], employeeName: string, canAdmin: boolean) {
  return canAdmin ? rows : rows.filter((row) => row.label === employeeName);
}

function isAdminEmployee(employee?: Employee) {
  return employee?.role === "HR_ADMIN" || employee?.role === "SYSTEM_ADMIN";
}

function adminActorId(employee?: Employee) {
  return employee && isAdminEmployee(employee) ? employee.id : "emp-ceo";
}

function roleLabel(role: Employee["role"]) {
  const labels = {
    EMPLOYEE: "직원",
    APPROVER: "승인자",
    HR_ADMIN: "HR 관리자",
    SYSTEM_ADMIN: "시스템 관리자"
  } satisfies Record<Employee["role"], string>;

  return labels[role];
}

export default App;
