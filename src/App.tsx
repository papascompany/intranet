import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  CircleCheck,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  History,
  LogIn,
  LogOut,
  ListChecks,
  LayoutDashboard,
  MapPin,
  QrCode,
  Settings,
  ShieldCheck,
  TimerReset,
  Upload,
  UserRound
} from "lucide-react";
import {
  clockAttendance,
  cancelRequest,
  createAttendanceCorrection,
  createEmployeeAccount,
  createDailyWorkTaskPlan,
  createWorkplace,
  getAppBootstrap,
  downloadPayrollStatement,
  getEmployeeSnapshot,
  getAuditLogs,
  importEmployeeAccounts,
  resetEmployeeAccountPassword,
  revealEmployeeSensitiveData,
  setOvertimePayApproval,
  setEmployeeAccountAccess,
  softDeletePayrollStatement,
  submitLeaveRequest,
  submitOvertimeRequest,
  submitAttendanceCorrectionRequest,
  updateEmployeeCard,
  updateWorkplace,
  deleteWorkplace,
  updateDailyWorkTaskStatus,
  updateDailyWorkTaskPlan,
  updateSettings,
  updateRequestStatus,
  updateAttendanceCorrectionRequestStatus
} from "./api/hrHttpClient";
import { defaultSystemPolicy, type Dashboard, type EmployeeAccountState, type EmployeeSnapshot, type SystemPolicy } from "./api/types";
import { isAdminSession, type AuthSession } from "./api/auth";
import { changeAuthenticatedPassword, getAuthenticatedSession, loginWithLoginId, logoutAuthenticatedSession } from "./api/authHttpClient";
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
import { FormDialog, InlineNotice } from "./components/operational";
import { DailyWorkPlanManager, type DailyWorkPlanDraft } from "./components/dailyWorkPlanManager";
import { EmployeeCardEditor, type EmployeeCardEditorSubmit } from "./components/employeeCardEditor";
import { EmployeeAccountManager, type EmployeeAccountCreateInput } from "./components/employeeAccountManager";
import { EmployeeDirectory } from "./components/employeeDirectory";
import { ForcePasswordChange } from "./components/forcePasswordChange";
import { ApprovalQueue, type ApprovalQueueItem } from "./components/approvalQueue";
import { AuditLogExplorer } from "./components/auditLogExplorer";
import { PayrollStatementManager } from "./components/payrollStatementManager";
import { SystemPolicyEditor } from "./components/systemPolicyEditor";
import { WorkplaceManager } from "./components/workplaceManager";
import type { AuditLog, ClockType, CorrectionType, DailyWorkTask, Employee, LeaveBalance, LeaveType, PayrollStatement, VerificationMethod, Workplace } from "./domain/types";
import { getLeaveBalance } from "./domain/leave";
import { isPayrollNoticeDay, payrollNoticeDate } from "./domain/payroll";
import { buildEmployeeViewModel, type EmployeeViewModel } from "./features/employeeViewModel";
import { buildEmployeeCardViewModel, type EmployeeCardRow } from "./features/employeeCardViewModel";
import type { EmployeeImportRow } from "./features/employeeCsv";
import { uploadPayrollPdfDirect } from "./api/payrollClientUpload";
import {
  buildErpViewModel,
  type ErpActiveSection,
  type ErpViewModel,
  type ErpViewModelRow
} from "./features/erpViewModel";

const today = koreaTimestamp();

const navIcons: Record<ErpActiveSection, React.ReactNode> = {
  overview: <LayoutDashboard size={16} />,
  "self-service": <Fingerprint size={16} />,
  "employee-card": <BadgeCheck size={16} />,
  attendance: <MapPin size={16} />,
  approvals: <ClipboardCheck size={16} />,
  leave: <CalendarDays size={16} />,
  overtime: <Clock size={16} />,
  payroll: <FileText size={16} />,
  settings: <Settings size={16} />,
  history: <History size={16} />,
  audit: <History size={16} />
};

type UserMode = "EMPLOYEE" | "ADMIN";
type RequestDialog = "leave" | "overtime" | null;

type LeaveDraft = {
  days: string;
  endsOn: string;
  reason: string;
  startsOn: string;
  type: LeaveType;
};

type OvertimeDraft = {
  date: string;
  endsAt: string;
  reason: string;
  startsAt: string;
};

type PayrollUploadDraft = {
  file: File | null;
  month: string;
};

type ClockFeedback = {
  label: string;
  status: string;
  time: string;
};

const employeeSections: ErpActiveSection[] = ["self-service", "attendance", "leave", "overtime", "payroll", "history"];
const approverSections: ErpActiveSection[] = [...employeeSections, "approvals"];
const adminSections: ErpActiveSection[] = ["overview", "employee-card", "attendance", "approvals", "leave", "overtime", "payroll", "settings", "history", "audit"];
const employeeNavLabels: Partial<Record<ErpActiveSection, string>> = {
  "self-service": "나의 하루",
  "employee-card": "내 정보",
  attendance: "근태 기록",
  leave: "휴가",
  overtime: "야근",
  payroll: "급여",
  history: "처리 이력"
};

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
  const [activeSection, setActiveSection] = useState<ErpActiveSection>(() => sectionFromLocation());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("emp-ops-1");
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(false);
  const [userMode, setUserMode] = useState<UserMode>("EMPLOYEE");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeAccountStates, setEmployeeAccountStates] = useState<EmployeeAccountState[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [employeeSnapshot, setEmployeeSnapshot] = useState<EmployeeSnapshot | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [notice, setNotice] = useState("운영팀 파일럿 API/DB 계층이 준비되었습니다.");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clockingType, setClockingType] = useState<ClockType | null>(null);
  const [clockError, setClockError] = useState<string | null>(null);
  const [clockFeedback, setClockFeedback] = useState<ClockFeedback | null>(null);
  const [requestDialog, setRequestDialog] = useState<RequestDialog>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [leaveDraft, setLeaveDraft] = useState<LeaveDraft>({
    type: "ANNUAL",
    startsOn: "",
    endsOn: "",
    days: "1",
    reason: ""
  });
  const [overtimeDraft, setOvertimeDraft] = useState<OvertimeDraft>({
    date: "",
    startsAt: "",
    endsAt: "",
    reason: ""
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [taskPlanError, setTaskPlanError] = useState<string | null>(null);
  const [isSavingTaskPlan, setIsSavingTaskPlan] = useState(false);
  const [isCorrectionDialogOpen, setIsCorrectionDialogOpen] = useState(false);
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState<{ afterValue: string; reason: string; type: CorrectionType }>({
    type: "CLOCK_IN_CORRECTION",
    afterValue: "",
    reason: ""
  });
  const [isEmployeeCardEditorOpen, setIsEmployeeCardEditorOpen] = useState(false);
  const [isSavingEmployeeCard, setIsSavingEmployeeCard] = useState(false);
  const [employeeCardError, setEmployeeCardError] = useState<string | null>(null);
  const [isRevealingEmployeeSensitiveData, setIsRevealingEmployeeSensitiveData] = useState(false);
  const [isEmployeeSensitiveDataRevealed, setIsEmployeeSensitiveDataRevealed] = useState(false);
  const [revealedEmployee, setRevealedEmployee] = useState<Employee | null>(null);
  const [isPayrollUploadOpen, setIsPayrollUploadOpen] = useState(false);
  const [isUploadingPayroll, setIsUploadingPayroll] = useState(false);
  const [payrollUploadError, setPayrollUploadError] = useState<string | null>(null);
  const [payrollUploadDraft, setPayrollUploadDraft] = useState<PayrollUploadDraft>({ file: null, month: today.slice(0, 7) });

  const refresh = useCallback(
    async (employeeId: string) => {
      if (!isLoggedIn || !authSession || authSession.passwordChangeRequired) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setLoadError(null);
      try {
        const session = authSession;
        const snapshotEmployeeId = !isAdminSession(session) ? session.employeeId : employeeId;
        const bootstrap = await getAppBootstrap(snapshotEmployeeId, today, session);

        setEmployees(bootstrap.employees);
        setSelectedEmployeeId(snapshotEmployeeId);
        setDashboard(bootstrap.dashboard);
        setEmployeeSnapshot(bootstrap.employeeSnapshot);
        setEmployeeAccountStates(bootstrap.employeeAccountStates);
        setIsEmployeeSensitiveDataRevealed(false);
        setRevealedEmployee(null);
        setClockFeedback(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.";
        setLoadError(message);
        setNotice("데이터 동기화에 실패했습니다. 다시 시도해 주세요.");
      } finally {
        setIsLoading(false);
      }
    },
    [authSession, isLoggedIn]
  );

  useEffect(() => {
    if (authSession && isLoggedIn && !authSession.passwordChangeRequired) {
      void refresh(authSession.employeeId);
    }
  }, [authSession, isLoggedIn, refresh]);

  useEffect(() => {
    let active = true;
    void getAuthenticatedSession()
      .then((session) => {
        if (!active) return;
        setAuthSession(session);
        setSelectedEmployeeId(session.employeeId);
        setIsLoggedIn(true);
      })
      .catch(() => {
        if (!active) return;
        setAuthSession(null);
        setIsLoggedIn(false);
      })
      .finally(() => {
        if (active) setIsAuthenticating(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const baseSelectedEmployee = employeeSnapshot?.employee.id === selectedEmployeeId
    ? employeeSnapshot.employee
    : employees.find((employee) => employee.id === selectedEmployeeId);
  const selectedEmployee = revealedEmployee?.id === baseSelectedEmployee?.id ? revealedEmployee : baseSelectedEmployee;
  const requestedLeaveDays = Number(leaveDraft.days);
  const pendingAnnualLeaveDays = employeeSnapshot?.leaveRequests
    .filter((request) => request.status === "PENDING" && (request.type === "ANNUAL" || request.type === "HALF_DAY"))
    .reduce((sum, request) => sum + request.days, 0) ?? 0;
  const requestableLeaveDays = Math.max((employeeSnapshot?.leaveBalance.availableDays ?? 0) - pendingAnnualLeaveDays, 0);
  const checksLeaveBalance = leaveDraft.type === "ANNUAL" || leaveDraft.type === "HALF_DAY";
  const leaveBalanceInsufficient = checksLeaveBalance
    && !dashboard?.settings?.annualLeaveOveruseAllowed
    && Number.isFinite(requestedLeaveDays)
    && requestedLeaveDays > requestableLeaveDays;
  const isAdminAccount = isAdminSession(authSession ?? undefined);
  const isApproverAccount = authSession?.role === "APPROVER";
  const effectiveMode: UserMode = userMode === "ADMIN" && isAdminAccount ? "ADMIN" : "EMPLOYEE";
  const allowedSections = effectiveMode === "ADMIN" ? adminSections : isApproverAccount ? approverSections : employeeSections;
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
    () => {
      const workplaceName = employeeSnapshot?.workplaceOptions.find((workplace) => workplace.id === selectedEmployee?.workplaceId)?.name;
      return selectedEmployee
        ? buildEmployeeCardViewModel(selectedEmployee, effectiveMode, { revealSensitive: isEmployeeSensitiveDataRevealed, workplaceName })
        : [];
    },
    [effectiveMode, employeeSnapshot?.workplaceOptions, isEmployeeSensitiveDataRevealed, selectedEmployee]
  );
  const visibleNavItems = useMemo(
    () =>
      (erpViewModel?.navItems.filter((item) => allowedSections.includes(item.section)) ?? []).map((item) => ({
        ...item,
        label: effectiveMode === "EMPLOYEE" ? employeeNavLabels[item.section] ?? item.label : item.label
      })),
    [allowedSections, effectiveMode, erpViewModel]
  );

  useEffect(() => {
    if (!allowedSections.includes(activeSection)) {
      setActiveSection(allowedSections[0]);
    }
  }, [activeSection, allowedSections]);

  useEffect(() => {
    const handlePopState = () => setActiveSection(sectionFromLocation());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("section", activeSection);
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [activeSection]);

  useEffect(() => {
    if (!isLoggedIn || !authSession || authSession.passwordChangeRequired || !["audit", "history", "employee-card"].includes(activeSection)) {
      return;
    }

    let active = true;
    setIsAuditLoading(true);
    void getAuditLogs({ session: authSession, limit: 500 })
      .then((logs) => {
        if (active) setAuditLogs(logs);
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : "처리 이력을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setIsAuditLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeSection, authSession, isLoggedIn]);

  useEffect(() => {
    if (userMode === "ADMIN" && selectedEmployee && !isAdminAccount) {
      setUserMode("EMPLOYEE");
      setNotice("관리자모드는 관리자 지정 계정만 사용할 수 있습니다.");
    }
  }, [isAdminAccount, selectedEmployee, userMode]);

  function handleEmployeeChange(employeeId: string) {
    if (authSession && !isAdminSession(authSession) && authSession.role !== "APPROVER" && employeeId !== authSession.employeeId) {
      setNotice("직원 계정은 본인 데이터만 조회할 수 있습니다.");
      return;
    }

    if (!authSession || employeeId === selectedEmployeeId) return;
    const nextEmployee = employees.find((employee) => employee.id === employeeId);
    if (!nextEmployee || !dashboard) {
      setLoadError("선택한 직원 정보를 찾지 못했습니다.");
      return;
    }

    setSelectedEmployeeId(employeeId);
    setEmployeeSnapshot((current) => buildAdminSelectionSnapshot(nextEmployee, dashboard, current?.workplaceOptions ?? []));
    setIsEmployeeSensitiveDataRevealed(false);
    setRevealedEmployee(null);
    setClockFeedback(null);
    setLoadError(null);
    void getEmployeeSnapshot(employeeId, dashboard.asOf, authSession ?? undefined)
      .then((snapshot) => {
        setEmployeeSnapshot((current) => current?.employee.id === employeeId ? snapshot : current);
      })
      .catch(() => {
        // The instant summary remains usable when the background detail refresh is unavailable.
      });
    if (rememberLogin) {
      localStorage.setItem("intranet:employee-id", employeeId);
    }
  }

  async function handleLogin(loginId: string, password: string) {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const nextSession = await loginWithLoginId({ loginId, password, rememberLogin });
      setAuthSession(nextSession);
      setSelectedEmployeeId(nextSession.employeeId);
      setIsLoggedIn(true);
      setNotice(nextSession.passwordChangeRequired ? "새 비밀번호를 설정해 주세요." : "로그인되었습니다. 오늘의 업무를 시작합니다.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "로그인하지 못했습니다.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handleRequiredPasswordChange(newPassword: string) {
    const nextSession = await changeAuthenticatedPassword(newPassword);
    setAuthSession(nextSession);
    setNotice("비밀번호를 변경했습니다. 오늘의 업무를 시작합니다.");
  }

  async function handleLogout() {
    try {
      await logoutAuthenticatedSession();
    } catch {
      // The local view must still clear when an already-expired session cannot be logged out remotely.
    }
    setAuthSession(null);
    setRememberLogin(false);
    setIsLoggedIn(false);
    setUserMode("EMPLOYEE");
    setActiveSection("self-service");
    setNotice("로그아웃되었습니다.");
    setAuditLogs([]);
  }

  function changeMode(nextMode: UserMode) {
    if (nextMode === "ADMIN" && !isAdminAccount) {
      setNotice("관리자 지정 계정만 관리자모드로 전환할 수 있습니다.");
      return;
    }

    setUserMode(nextMode);
    setActiveSection(nextMode === "ADMIN" ? "overview" : "self-service");
    setNotice(nextMode === "ADMIN" ? "관리자모드로 전환했습니다." : "직원모드로 전환했습니다.");
  }

  async function clock(type: ClockType, method: VerificationMethod, gpsError = false) {
    if (!selectedEmployee || clockingType) return;

    setClockingType(type);
    setClockError(null);
    setClockFeedback(null);
    try {
      const now = koreaTimestamp();
      let coordinate: { accuracyMeters?: number; latitude: number; longitude: number } | undefined;
      let verificationFailed = gpsError;

      if (method === "GPS" && !gpsError) {
        try {
          coordinate = await getBrowserCoordinate();
        } catch {
          verificationFailed = true;
        }
      }
      const result = await clockAttendance({
        employeeId: selectedEmployee.id,
        type,
        method,
        session: authSession ?? undefined,
        now,
        gpsError: verificationFailed,
        coordinate
      });

      const fallbackNotice = method === "GPS" && verificationFailed ? " · 위치 확인 실패로 대체 인증 처리" : "";
      const recordedAt = type === "CLOCK_IN" ? result.attendance.clockInAt : result.attendance.clockOutAt;
      setEmployeeSnapshot((current) => current && current.employee.id === selectedEmployee.id ? {
        ...current,
        todayAttendance: result.attendance,
        attendanceRecords: upsertRecord(current.attendanceRecords, result.attendance)
      } : current);
      setDashboard((current) => current ? {
        ...current,
        todayAttendance: upsertRecord(current.todayAttendance, result.attendance)
      } : current);
      setClockFeedback({
        label: type === "CLOCK_IN" ? "출근 완료" : "퇴근 완료",
        status: verificationStatusLabel(result.verification.status),
        time: formatKoreaTime(recordedAt ?? now)
      });
      setNotice(`${selectedEmployee.name} ${type === "CLOCK_IN" ? "출근" : "퇴근"} 처리 · ${result.verification.status}${fallbackNotice}`);
    } catch (error) {
      setClockError(error instanceof Error ? error.message : "출퇴근 기록을 처리하지 못했습니다.");
    } finally {
      setClockingType(null);
    }
  }

  async function updateDailyTask(task: DailyWorkTask) {
    if (!selectedEmployee) return;

    const nextStatus = task.status === "DONE" ? "TODO" : "DONE";
    const result = await updateDailyWorkTaskStatus({
      taskId: task.id,
      status: nextStatus,
      actorId: authActorId(authSession, selectedEmployee.id),
      session: authSession ?? undefined,
      completedAt: nextStatus === "DONE" ? today : undefined
    });

    setNotice(nextStatus === "DONE" ? `작업 완료 · ${result.task.title}` : `완료 취소 · ${result.task.title}`);
    setEmployeeSnapshot((current) => current ? {
      ...current,
      dailyWorkTasks: upsertRecord(current.dailyWorkTasks, result.task)
    } : current);
  }

  async function createDailyTaskPlan(draft: DailyWorkPlanDraft) {
    if (!selectedEmployee) return;
    setIsSavingTaskPlan(true);
    setTaskPlanError(null);
    try {
      const result = await createDailyWorkTaskPlan({
        ...draft,
        actorId: authActorId(authSession, selectedEmployee.id),
        session: authSession ?? undefined
      });
      setNotice(`작업 배정 · ${result.task.title}`);
      setEmployeeSnapshot((current) => current && current.employee.id === result.task.employeeId ? {
        ...current,
        dailyWorkTasks: upsertRecord(current.dailyWorkTasks, result.task)
      } : current);
    } catch (error) {
      setTaskPlanError(error instanceof Error ? error.message : "작업을 배정하지 못했습니다.");
      throw error;
    } finally {
      setIsSavingTaskPlan(false);
    }
  }

  async function updateDailyTaskPlan(taskId: string, draft: DailyWorkPlanDraft) {
    if (!selectedEmployee) return;
    setIsSavingTaskPlan(true);
    setTaskPlanError(null);
    try {
      const result = await updateDailyWorkTaskPlan({
        taskId,
        ...draft,
        actorId: authActorId(authSession, selectedEmployee.id),
        session: authSession ?? undefined
      });
      setNotice(`작업계획 변경 · ${result.task.title}`);
      setEmployeeSnapshot((current) => current && current.employee.id === result.task.employeeId ? {
        ...current,
        dailyWorkTasks: upsertRecord(current.dailyWorkTasks, result.task)
      } : current);
    } catch (error) {
      setTaskPlanError(error instanceof Error ? error.message : "작업계획을 변경하지 못했습니다.");
      throw error;
    } finally {
      setIsSavingTaskPlan(false);
    }
  }

  async function submitLeave() {
    if (!selectedEmployee) return;

    const days = Number(leaveDraft.days);
    if (!leaveDraft.startsOn || !leaveDraft.endsOn || !leaveDraft.reason.trim() || !Number.isFinite(days) || days <= 0) {
      setRequestError("휴가 유형, 기간, 일수, 사유를 모두 입력해 주세요.");
      return;
    }
    if (leaveBalanceInsufficient) {
      setRequestError(`신청 가능한 연차는 ${formatLeaveDays(requestableLeaveDays)}입니다. 무급휴가를 선택하거나 관리자에게 연차 보정을 요청해 주세요.`);
      return;
    }

    setIsSubmittingRequest(true);
    setRequestError(null);
    try {
      const result = await submitLeaveRequest({
        employeeId: selectedEmployee.id,
        type: leaveDraft.type,
        startsOn: leaveDraft.startsOn,
        endsOn: leaveDraft.endsOn,
        days,
        reason: leaveDraft.reason.trim(),
        actorId: authActorId(authSession, selectedEmployee.id),
        session: authSession ?? undefined
      });

      setNotice(`${selectedEmployee.name} 휴가 신청 · ${result.request.status}`);
      setEmployeeSnapshot((current) => current && current.employee.id === selectedEmployee.id
        ? { ...current, leaveRequests: [result.request, ...current.leaveRequests] }
        : current);
      setDashboard((current) => current ? {
        ...current,
        leaveRequests: [result.request, ...current.leaveRequests],
        pendingLeaveRequests: [result.request, ...current.pendingLeaveRequests]
      } : current);
      setRequestDialog(null);
      setLeaveDraft({ type: "ANNUAL", startsOn: "", endsOn: "", days: "1", reason: "" });
      setActiveSection("leave");
    } catch (error) {
      setRequestError(humanizeLeaveError(error, requestableLeaveDays));
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function submitOvertime() {
    if (!selectedEmployee) return;

    if (!overtimeDraft.date || !overtimeDraft.startsAt || !overtimeDraft.endsAt || !overtimeDraft.reason.trim()) {
      setRequestError("근무일, 시작·종료 시각, 사유를 모두 입력해 주세요.");
      return;
    }

    const startsAt = `${overtimeDraft.date}T${overtimeDraft.startsAt}:00+09:00`;
    const endsAt = `${overtimeDraft.date}T${overtimeDraft.endsAt}:00+09:00`;
    const minutes = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setRequestError("종료 시각은 시작 시각 이후여야 합니다.");
      return;
    }

    setIsSubmittingRequest(true);
    setRequestError(null);
    try {
      const result = await submitOvertimeRequest({
        employeeId: selectedEmployee.id,
        date: overtimeDraft.date,
        startsAt,
        endsAt,
        minutes,
        reason: overtimeDraft.reason.trim(),
        actorId: authActorId(authSession, selectedEmployee.id),
        session: authSession ?? undefined
      });

      setNotice(`${selectedEmployee.name} 야근 신청 · ${result.request.status}`);
      setEmployeeSnapshot((current) => current && current.employee.id === selectedEmployee.id
        ? { ...current, overtimeRequests: [result.request, ...current.overtimeRequests] }
        : current);
      setDashboard((current) => current ? { ...current, overtimeRequests: [result.request, ...current.overtimeRequests] } : current);
      setRequestDialog(null);
      setOvertimeDraft({ date: "", startsAt: "", endsAt: "", reason: "" });
      setActiveSection("overtime");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "야근 신청을 처리하지 못했습니다.");
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  function openRequestDialog(nextDialog: Exclude<RequestDialog, null>) {
    setRequestError(null);
    const workDate = today.slice(0, 10);
    if (nextDialog === "leave") {
      setLeaveDraft((current) => ({
        ...current,
        startsOn: current.startsOn || workDate,
        endsOn: current.endsOn || workDate
      }));
    } else {
      setOvertimeDraft((current) => ({
        ...current,
        date: current.date || workDate,
        startsAt: current.startsAt || dashboard?.settings?.workEndTime || "18:00"
      }));
    }
    setRequestDialog(nextDialog);
  }

  async function approveLeave(requestId?: string, status: "APPROVED" | "REJECTED" = "APPROVED", detail?: string) {
    if (!requestId) {
      setNotice("처리할 휴가 신청이 없습니다.");
      return;
    }

    const result = await updateRequestStatus({
      targetType: "LeaveRequest",
      requestId,
      status,
      actorId: authActorId(authSession, selectedEmployee?.id),
      session: authSession ?? undefined,
      detail: detail ?? `관리자 화면에서 휴가 ${status === "APPROVED" ? "승인" : "반려"}`
    });

    setNotice(`휴가 신청 ${status === "APPROVED" ? "승인" : "반려"} · ${result.request.id}`);
    await refresh(selectedEmployeeId);
  }

  async function approveOvertime(requestId?: string, status: "APPROVED" | "REJECTED" = "APPROVED", detail?: string) {
    if (!requestId) {
      setNotice("처리할 야근 신청이 없습니다.");
      return;
    }

    const result = await updateRequestStatus({
      targetType: "OvertimeRequest",
      requestId,
      status,
      actorId: authActorId(authSession, selectedEmployee?.id),
      session: authSession ?? undefined,
      detail: detail ?? `관리자 화면에서 야근 ${status === "APPROVED" ? "승인" : "반려"}`
    });

    if (status === "APPROVED") {
      await setOvertimePayApproval({
        requestId,
        payApproved: true,
        actorId: authActorId(authSession, selectedEmployee?.id),
        session: authSession ?? undefined,
        detail: "관리자 인정 초과근무수당 집계"
      });
    }

    setNotice(`야근 신청 ${status === "APPROVED" ? "승인 및 수당 인정" : "반려"} · ${result.request.id}`);
    await refresh(selectedEmployeeId);
  }

  async function cancelEmployeeRequest(targetType: "LeaveRequest" | "OvertimeRequest" | "AttendanceCorrectionRequest", requestId?: string) {
    if (!requestId || !selectedEmployee) {
      setNotice("취소할 신청이 없습니다.");
      return;
    }

    const result = await cancelRequest({
      targetType,
      requestId,
      actorId: authActorId(authSession, selectedEmployee.id),
      session: authSession ?? undefined
    });
    const label = targetType === "LeaveRequest" ? "휴가" : targetType === "OvertimeRequest" ? "야근" : "근태 정정";
    setNotice(`${label} 신청을 취소했습니다.`);
    await refresh(selectedEmployee.id);
    return result;
  }

  async function createCorrection() {
    if (!selectedEmployee || !employeeSnapshot?.todayAttendance) {
      setCorrectionError("보정할 오늘 출퇴근 기록이 없습니다.");
      return;
    }
    if (!correctionDraft.afterValue || !correctionDraft.reason.trim()) {
      setCorrectionError("보정 시각과 사유를 입력해 주세요.");
      return;
    }

    setIsSubmittingCorrection(true);
    setCorrectionError(null);
    try {
      const isClockOut = correctionDraft.type === "CLOCK_OUT_CORRECTION";
      const result = await createAttendanceCorrection({
        attendanceId: employeeSnapshot.todayAttendance.id,
        employeeId: selectedEmployee.id,
        correctedById: authActorId(authSession, selectedEmployee.id),
        session: authSession ?? undefined,
        type: correctionDraft.type,
        beforeValue: isClockOut ? employeeSnapshot.todayAttendance.clockOutAt : employeeSnapshot.todayAttendance.clockInAt,
        afterValue: `${employeeSnapshot.todayAttendance.date}T${correctionDraft.afterValue}:00+09:00`,
        reason: correctionDraft.reason.trim(),
        createdAt: new Date().toISOString()
      });

      setNotice(`${selectedEmployee.name} 보정 생성 · ${result.correction.type}`);
      setIsCorrectionDialogOpen(false);
      setCorrectionDraft({ type: "CLOCK_IN_CORRECTION", afterValue: "", reason: "" });
      await refresh(selectedEmployee.id);
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : "근태 보정을 저장하지 못했습니다.");
    } finally {
      setIsSubmittingCorrection(false);
    }
  }

  async function submitCorrectionRequest() {
    if (!selectedEmployee) {
      setCorrectionError("직원 정보를 불러오지 못했습니다.");
      return;
    }
    if (!correctionDraft.afterValue || !correctionDraft.reason.trim()) {
      setCorrectionError("정정 시각과 사유를 입력해 주세요.");
      return;
    }

    setIsSubmittingCorrection(true);
    setCorrectionError(null);
    try {
      const attendance = employeeSnapshot?.todayAttendance;
      const isClockOut = correctionDraft.type === "CLOCK_OUT_CORRECTION";
      const result = await submitAttendanceCorrectionRequest({
        attendanceId: attendance?.id,
        employeeId: selectedEmployee.id,
        session: authSession ?? undefined,
        type: correctionDraft.type,
        beforeValue: isClockOut ? attendance?.clockOutAt : attendance?.clockInAt,
        requestedValue: `${attendance?.date ?? today.slice(0, 10)}T${correctionDraft.afterValue}:00+09:00`,
        reason: correctionDraft.reason.trim(),
        createdAt: new Date().toISOString()
      });

      setNotice(`근태 정정 신청이 접수되었습니다 · ${result.request.id}`);
      setIsCorrectionDialogOpen(false);
      setCorrectionDraft({ type: "CLOCK_IN_CORRECTION", afterValue: "", reason: "" });
      await refresh(selectedEmployee.id);
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : "근태 정정 신청을 저장하지 못했습니다.");
    } finally {
      setIsSubmittingCorrection(false);
    }
  }

  async function approveAttendanceCorrection(requestId?: string, status: "APPROVED" | "REJECTED" = "APPROVED", detail?: string) {
    if (!requestId) {
      setNotice("처리할 근태 정정 신청이 없습니다.");
      return;
    }

    const result = await updateAttendanceCorrectionRequestStatus({
      requestId,
      status,
      actorId: authActorId(authSession, selectedEmployee?.id),
      session: authSession ?? undefined,
      detail: detail ?? `관리자 화면에서 근태 정정 ${status === "APPROVED" ? "승인" : "반려"}`
    });

    setNotice(`근태 정정 신청 ${status === "APPROVED" ? "승인" : "반려"} · ${result.request.id}`);
    await refresh(selectedEmployeeId);
  }

  function openCorrectionDialog() {
    setCorrectionError(null);
    setIsCorrectionDialogOpen(true);
  }

  function openPayrollUpload() {
    setPayrollUploadError(null);
    setPayrollUploadDraft({ file: null, month: today.slice(0, 7) });
    setIsPayrollUploadOpen(true);
  }

  async function uploadPayroll() {
    if (!selectedEmployee) return;
    if (!payrollUploadDraft.file) {
      setPayrollUploadError("업로드할 PDF 파일을 선택해 주세요.");
      return;
    }
    if (payrollUploadDraft.file.type !== "application/pdf" || !payrollUploadDraft.file.name.toLowerCase().endsWith(".pdf")) {
      setPayrollUploadError("급여명세서는 PDF 파일만 업로드할 수 있습니다.");
      return;
    }

    setIsUploadingPayroll(true);
    setPayrollUploadError(null);
    try {
      await uploadPayrollPdfDirect({
        employeeId: selectedEmployee.id,
        month: payrollUploadDraft.month,
        file: payrollUploadDraft.file
      });
      setNotice(`${selectedEmployee.name} 급여명세서 업로드 완료 · 명세서 등록 중`);
      setIsPayrollUploadOpen(false);
      await refresh(selectedEmployee.id);
    } catch (error) {
      setPayrollUploadError(error instanceof Error ? error.message : "급여명세서를 업로드하지 못했습니다.");
    } finally {
      setIsUploadingPayroll(false);
    }
  }

  async function downloadPayroll(statementId?: string) {
    if (!statementId) {
      setNotice("다운로드할 급여명세서가 없습니다.");
      return;
    }

    const result = await downloadPayrollStatement({
      statementId,
      actorId: authActorId(authSession, selectedEmployee?.id),
      session: authSession ?? undefined
    });

    const downloadLink = document.createElement("a");
    downloadLink.href = result.signedUrl;
    downloadLink.download = result.statement.filename;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setNotice(`급여명세서를 내려받습니다 · ${result.statement.month}`);
  }

  async function deletePayroll(statementId?: string, deleteReason?: string) {
    if (!statementId) {
      setNotice("삭제할 급여명세서가 없습니다.");
      return;
    }

    const result = await softDeletePayrollStatement({
      statementId,
      actorId: authActorId(authSession, selectedEmployee?.id),
      session: authSession ?? undefined,
      deleteReason: deleteReason?.trim() || "관리자 화면에서 급여명세서 삭제"
    });

    setNotice(`급여명세서 삭제 처리 · ${result.statement.month}`);
    await refresh(selectedEmployeeId);
  }

  async function updateSelectedEmployeeCard(input: EmployeeCardEditorSubmit) {
    if (!selectedEmployee) return;
    setIsSavingEmployeeCard(true);
    setEmployeeCardError(null);
    try {
      const result = await updateEmployeeCard({
        employeeId: input.employeeId,
        actorId: authActorId(authSession, selectedEmployee.id),
        session: authSession ?? undefined,
        patch: input.update,
        reason: input.reason
      });
      setNotice(`${result.employee.name} 직원카드 저장 · 감사로그 ${result.auditLog.id}`);
      setIsEmployeeCardEditorOpen(false);
      await refresh(selectedEmployee.id);
    } catch (error) {
      setEmployeeCardError(error instanceof Error ? error.message : "직원카드를 저장하지 못했습니다.");
    } finally {
      setIsSavingEmployeeCard(false);
    }
  }

  async function openEmployeeCardEditor() {
    if (!selectedEmployee) return;
    setEmployeeCardError(null);

    if (effectiveMode !== "ADMIN" || isEmployeeSensitiveDataRevealed) {
      setIsEmployeeCardEditorOpen(true);
      return;
    }

    setIsRevealingEmployeeSensitiveData(true);
    try {
      const result = await revealEmployeeSensitiveData({ employeeId: selectedEmployee.id });
      setRevealedEmployee(result.employee);
      setIsEmployeeSensitiveDataRevealed(true);
      setIsEmployeeCardEditorOpen(true);
      setNotice(`${selectedEmployee.name} 인사카드 열람 · 감사로그 ${result.auditLog.id}`);
    } catch (error) {
      setEmployeeCardError(error instanceof Error ? error.message : "인사카드를 열지 못했습니다.");
    } finally {
      setIsRevealingEmployeeSensitiveData(false);
    }
  }

  async function toggleEmployeeSensitiveData() {
    if (isEmployeeSensitiveDataRevealed) {
      setIsEmployeeSensitiveDataRevealed(false);
      setRevealedEmployee(null);
      return;
    }
    if (!selectedEmployee) return;

    setIsRevealingEmployeeSensitiveData(true);
    setEmployeeCardError(null);
    try {
      const result = await revealEmployeeSensitiveData({ employeeId: selectedEmployee.id });
      setRevealedEmployee(result.employee);
      setIsEmployeeSensitiveDataRevealed(true);
      setNotice(`${selectedEmployee.name} 민감정보 열람 · 감사로그 ${result.auditLog.id}`);
    } catch (error) {
      setEmployeeCardError(error instanceof Error ? error.message : "민감정보를 열람하지 못했습니다.");
    } finally {
      setIsRevealingEmployeeSensitiveData(false);
    }
  }

  async function createManagedEmployeeAccount(input: EmployeeAccountCreateInput) {
    const { loginId, ...employee } = input;
    const result = await createEmployeeAccount({ loginId, employee: { ...employee, pilot: false } });
    setNotice(`${result.employee.name} 직원 계정 발급 · 임시 비밀번호를 안전하게 전달하세요.`);
    await refresh(result.employee.id);
    return { temporaryPassword: result.temporaryPassword };
  }

  async function importManagedEmployeeAccounts(rows: EmployeeImportRow[]) {
    const result = await importEmployeeAccounts({ rows });
    setNotice(`직원명부 가져오기 완료 · ${result.created.length}명 계정 발급`);
    await refresh(selectedEmployeeId);
    return result;
  }

  async function resetManagedEmployeePassword(employeeId: string, temporaryPassword: string) {
    await resetEmployeeAccountPassword(employeeId, temporaryPassword);
    const employee = employees.find((item) => item.id === employeeId);
    setNotice(`${employee?.name ?? "직원"} 임시 비밀번호를 설정했습니다.`);
    await refresh(employeeId);
  }

  async function setManagedEmployeeAccountAccess(employeeId: string, enabled: boolean) {
    const result = await setEmployeeAccountAccess(employeeId, enabled);
    const employee = employees.find((item) => item.id === employeeId);
    setNotice(`${employee?.name ?? "직원"} 계정 ${result.enabled ? "사용 설정" : "사용 중지"}`);
    await refresh(selectedEmployeeId);
  }

  async function updateSystemPolicy(settings: SystemPolicy) {
    if (!selectedEmployee || !isAdminAccount) {
      setNotice("GPS 허용 반경은 관리자 지정 계정만 변경할 수 있습니다.");
      return;
    }

    const result = await updateSettings({
      actorId: authActorId(authSession, selectedEmployee.id),
      session: authSession ?? undefined,
      settings
    });

    setNotice(`운영 정책 저장 · GPS 허용 반경 ${result.settings.gpsAllowedRadiusMeters}m`);
    await refresh(selectedEmployee.id);
  }

  async function createManagedWorkplace(workplace: Omit<Workplace, "id">) {
    if (!selectedEmployee || !isAdminAccount) return;
    const result = await createWorkplace({
      actorId: authActorId(authSession, selectedEmployee.id),
      session: authSession ?? undefined,
      workplace
    });
    setNotice(`근무지 등록 · ${result.workplace.name}`);
    await refresh(selectedEmployee.id);
  }

  async function updateManagedWorkplace(workplaceId: string, patch: Partial<Omit<Workplace, "id">>) {
    if (!selectedEmployee || !isAdminAccount) return;
    const result = await updateWorkplace({
      actorId: authActorId(authSession, selectedEmployee.id),
      session: authSession ?? undefined,
      workplaceId,
      patch
    });
    setNotice(`근무지 변경 저장 · ${result.workplace.name}`);
    await refresh(selectedEmployee.id);
  }

  async function deleteManagedWorkplace(workplaceId: string) {
    if (!selectedEmployee || !isAdminAccount) return;
    const result = await deleteWorkplace({
      actorId: authActorId(authSession, selectedEmployee.id),
      session: authSession ?? undefined,
      workplaceId
    });
    setNotice(`근무지 삭제 · ${result.workplace.name}`);
    await refresh(selectedEmployee.id);
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        authError={authError}
        isLoading={isAuthenticating}
        onLogin={handleLogin}
        onRememberChange={setRememberLogin}
        rememberLogin={rememberLogin}
      />
    );
  }

  if (authSession?.passwordChangeRequired) {
    return <ForcePasswordChange onSubmit={handleRequiredPasswordChange} />;
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
              <h1>사내 근태 관리</h1>
            </div>
            <div className="topbar-controls">
              {isAdminAccount ? (
                <>
                  <button className="mode-button" onClick={() => changeMode(effectiveMode === "ADMIN" ? "EMPLOYEE" : "ADMIN")}>
                    <ShieldCheck size={16} />
                    {effectiveMode === "ADMIN" ? "직원 화면" : "관리자 화면"}
                  </button>
                  {effectiveMode === "ADMIN" ? (
                    <label className="select-label select-label--compact">
                      조회 대상
                      <select value={selectedEmployeeId} onChange={(event) => void handleEmployeeChange(event.target.value)}>
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name} · {employee.department}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </>
              ) : null}
              <details className="account-menu">
                <summary aria-label="계정 메뉴 열기">
                  <span className="account-menu__avatar" aria-hidden="true"><UserRound size={16} /></span>
                  <span className="signed-in-identity">
                    <strong>{selectedEmployee?.name ?? "직원"}</strong>
                    <span>{selectedEmployee?.department ?? ""}</span>
                  </span>
                  <ChevronDown size={15} aria-hidden="true" />
                </summary>
                <div className="account-menu__popover">
                  <div className="account-menu__context">
                    <strong>{selectedEmployee?.name ?? "직원"}</strong>
                    <span>{isAdminAccount ? "관리자 계정" : "직원 계정"}</span>
                  </div>
                  <button className="account-menu__logout" onClick={handleLogout} type="button">
                    <LogOut size={16} />
                    로그아웃
                  </button>
                </div>
              </details>
            </div>
          </>
        }
      >
        <Toolbar
          title={effectiveMode === "EMPLOYEE" && activeSection === "self-service" ? "오늘의 업무" : sectionTitle(activeSection)}
          description={effectiveMode === "EMPLOYEE" && activeSection === "self-service" ? "필요한 일만 빠르게 확인하고 처리하세요." : notice}
          actions={
            <InlineActions>
              <button disabled={isLoading} onClick={() => void refresh(selectedEmployeeId)}>
                새로고침
              </button>
            </InlineActions>
          }
        />
        {loadError ? (
          <InlineNotice onDismiss={() => setLoadError(null)} title="동기화 오류" tone="danger">
            {loadError}
          </InlineNotice>
        ) : null}

        {erpViewModel ? (
          <>
            {effectiveMode === "ADMIN" ? (
              <KpiGrid>
                {erpViewModel.kpis.map((kpi) => (
                  <KpiTile icon={iconForKpi(kpi.id)} key={kpi.id} label={kpi.label} value={kpi.value} footer={kpi.meta} />
                ))}
              </KpiGrid>
            ) : null}
            {renderSection({
              activeSection,
              employeeViewModel,
              erpViewModel,
              isLoading,
              onApproveLeave: approveLeave,
              onApproveOvertime: approveOvertime,
              onApproveAttendanceCorrection: approveAttendanceCorrection,
              onCancelLeave: (requestId) => void cancelEmployeeRequest("LeaveRequest", requestId),
              onCancelOvertime: (requestId) => void cancelEmployeeRequest("OvertimeRequest", requestId),
              onCancelAttendanceCorrection: (requestId) => void cancelEmployeeRequest("AttendanceCorrectionRequest", requestId),
              onCreateDailyTaskPlan: createDailyTaskPlan,
              onClock: clock,
              onUpdateDailyTask: updateDailyTask,
              onUpdateDailyTaskPlan: updateDailyTaskPlan,
              onCreateCorrection: openCorrectionDialog,
              onSubmitCorrectionRequest: () => {
                setCorrectionError(null);
                setIsCorrectionDialogOpen(true);
              },
              onDownloadPayroll: downloadPayroll,
              onDeletePayroll: deletePayroll,
              onUpdateEmployeeCard: () => void openEmployeeCardEditor(),
              onToggleEmployeeSensitiveData: toggleEmployeeSensitiveData,
              onCreateEmployeeAccount: createManagedEmployeeAccount,
              onImportEmployeeAccounts: importManagedEmployeeAccounts,
              onResetEmployeePassword: resetManagedEmployeePassword,
              onSetEmployeeAccountAccess: setManagedEmployeeAccountAccess,
              onUpdateSystemPolicy: updateSystemPolicy,
              onCreateWorkplace: createManagedWorkplace,
              onUpdateWorkplace: updateManagedWorkplace,
              onDeleteWorkplace: deleteManagedWorkplace,
              onSubmitLeave: () => openRequestDialog("leave"),
              onSubmitOvertime: () => openRequestDialog("overtime"),
              onUploadPayroll: openPayrollUpload,
              canAdmin: effectiveMode === "ADMIN",
              canManageRoles: authSession?.role === "SYSTEM_ADMIN",
              clockError,
              clockFeedback,
              clockingType,
              employeeAccountStates,
              employeeCardRows,
              employees,
              selectedEmployeeId,
              onSelectEmployee: handleEmployeeChange,
              dailyWorkTasks: employeeSnapshot?.dailyWorkTasks ?? [],
              leaveRequests: dashboard?.leaveRequests ?? [],
              correctionRequests: dashboard?.correctionRequests ?? [],
              leaveBalance: employeeSnapshot?.leaveBalance,
              leaveBalanceAdjustments: employeeSnapshot?.leaveBalanceAdjustments ?? [],
              overtimeRequests: dashboard?.overtimeRequests ?? [],
              payrollStatements: employeeSnapshot?.payrollStatements ?? [],
              systemPolicy: dashboard?.settings ?? defaultSystemPolicy,
              workplaces: employeeSnapshot?.workplaceOptions ?? [],
              auditLogs: auditLogs.length ? auditLogs : dashboard?.recentAuditLogs ?? [],
              isAuditLoading,
              isSavingTaskPlan,
              isRevealingEmployeeSensitiveData,
              isEmployeeSensitiveDataRevealed,
              taskPlanError
            })}
          </>
        ) : (
          <EmptyState title="데이터를 불러오는 중" description="API/DB 계층에서 파일럿 데이터를 동기화하고 있습니다." />
        )}
      </ErpShell>
      <FormDialog
        busy={isSubmittingRequest}
        error={requestDialog === "leave" ? requestError ?? undefined : undefined}
        onClose={() => setRequestDialog(null)}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void submitLeave();
        }}
        open={requestDialog === "leave"}
        submitDisabled={leaveBalanceInsufficient}
        submitLabel="휴가 신청"
        title="휴가 신청"
        description="승인 전까지는 대기 상태로 표시됩니다."
      >
        <RequestField label="휴가 유형">
          <select value={leaveDraft.type} onChange={(event) => setLeaveDraft((current) => {
            const type = event.target.value as LeaveType;
            return { ...current, type, days: type === "HALF_DAY" ? "0.5" : current.days === "0.5" ? "1" : current.days, endsOn: type === "HALF_DAY" ? current.startsOn : current.endsOn };
          })}>
            <option value="ANNUAL">연차</option>
            <option disabled={!dashboard?.settings?.partialLeaveAllowed} value="HALF_DAY">반차</option>
            <option value="SPECIAL">특별휴가</option>
            <option value="UNPAID">무급휴가</option>
          </select>
        </RequestField>
        <div className="request-form__split">
          <RequestField label="시작일"><input required type="date" value={leaveDraft.startsOn} onChange={(event) => setLeaveDraft((current) => ({ ...current, startsOn: event.target.value, endsOn: !current.endsOn || current.endsOn < event.target.value || current.type === "HALF_DAY" ? event.target.value : current.endsOn }))} /></RequestField>
          <RequestField label="종료일"><input required min={leaveDraft.startsOn || undefined} type="date" value={leaveDraft.endsOn} onChange={(event) => setLeaveDraft((current) => ({ ...current, endsOn: event.target.value }))} /></RequestField>
        </div>
        <RequestField label="사용 일수"><input disabled={leaveDraft.type === "HALF_DAY"} required min={dashboard?.settings?.annualLeaveUnit ?? 0.5} step={dashboard?.settings?.annualLeaveUnit ?? 0.5} type="number" value={leaveDraft.days} onChange={(event) => setLeaveDraft((current) => ({ ...current, days: event.target.value }))} /></RequestField>
        {checksLeaveBalance ? (
          <InlineNotice tone={leaveBalanceInsufficient ? "warning" : "info"} title={leaveBalanceInsufficient ? "신청 가능한 연차가 부족합니다" : "신청 가능 연차"}>
            현재 신청 가능 {formatLeaveDays(requestableLeaveDays)}{pendingAnnualLeaveDays > 0 ? ` · 승인 대기 ${formatLeaveDays(pendingAnnualLeaveDays)} 반영` : ""}
            {leaveBalanceInsufficient ? " · 무급휴가를 선택하거나 관리자에게 HR 보정을 요청해 주세요." : ""}
          </InlineNotice>
        ) : null}
        <div aria-live="polite" className="request-summary">
          <span>신청 요약</span>
          <strong>{leaveTypeLabel(leaveDraft.type)} · {leaveDraft.startsOn || "시작일"}{leaveDraft.endsOn && leaveDraft.endsOn !== leaveDraft.startsOn ? ` ~ ${leaveDraft.endsOn}` : ""} · {leaveDraft.days || "0"}일</strong>
        </div>
        <RequestField label="사유"><textarea required rows={3} value={leaveDraft.reason} onChange={(event) => setLeaveDraft((current) => ({ ...current, reason: event.target.value }))} /></RequestField>
      </FormDialog>
      {selectedEmployee ? (
        <EmployeeCardEditor
          busy={isSavingEmployeeCard}
          canAdmin={effectiveMode === "ADMIN"}
          canManageRoles={authSession?.role === "SYSTEM_ADMIN" && authSession.employeeId !== selectedEmployee.id}
          employee={selectedEmployee}
          error={employeeCardError}
          onClose={() => setIsEmployeeCardEditorOpen(false)}
          onSubmit={updateSelectedEmployeeCard}
          open={isEmployeeCardEditorOpen}
          workplaces={employeeSnapshot?.workplaceOptions ?? []}
        />
      ) : null}
      <FormDialog
        busy={isUploadingPayroll}
        description="PDF 급여명세서는 직원별로 비공개 보관되며, 직원은 본인 파일만 열람할 수 있습니다."
        error={payrollUploadError ?? undefined}
        onClose={() => setIsPayrollUploadOpen(false)}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void uploadPayroll();
        }}
        open={isPayrollUploadOpen}
        submitDisabled={!payrollUploadDraft.file || !payrollUploadDraft.month}
        submitLabel="PDF 업로드"
        title="급여명세서 업로드"
      >
        <RequestField label="귀속월"><input required type="month" value={payrollUploadDraft.month} onChange={(event) => setPayrollUploadDraft((current) => ({ ...current, month: event.target.value }))} /></RequestField>
        <RequestField label="PDF 파일"><input accept="application/pdf,.pdf" required type="file" onChange={(event) => setPayrollUploadDraft((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} /></RequestField>
      </FormDialog>
      <FormDialog
        busy={isSubmittingRequest}
        error={requestDialog === "overtime" ? requestError ?? undefined : undefined}
        onClose={() => setRequestDialog(null)}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void submitOvertime();
        }}
        open={requestDialog === "overtime"}
        submitLabel="야근 신청"
        title="야근 신청"
        description="관리자 승인 후 상계 또는 수당 인정 대상이 됩니다."
      >
        <RequestField label="근무일"><input required type="date" value={overtimeDraft.date} onChange={(event) => setOvertimeDraft((current) => ({ ...current, date: event.target.value }))} /></RequestField>
        <div className="request-form__split">
          <RequestField label="시작 시각"><input required type="time" value={overtimeDraft.startsAt} onChange={(event) => setOvertimeDraft((current) => ({ ...current, startsAt: event.target.value }))} /></RequestField>
          <RequestField label="종료 시각"><input required type="time" value={overtimeDraft.endsAt} onChange={(event) => setOvertimeDraft((current) => ({ ...current, endsAt: event.target.value }))} /></RequestField>
        </div>
        <div aria-live="polite" className="request-summary">
          <span>신청 요약</span>
          <strong>{overtimeSummary(overtimeDraft)}</strong>
        </div>
        <RequestField label="사유"><textarea required rows={3} value={overtimeDraft.reason} onChange={(event) => setOvertimeDraft((current) => ({ ...current, reason: event.target.value }))} /></RequestField>
      </FormDialog>
      <FormDialog
        busy={isSubmittingCorrection}
        description={effectiveMode === "ADMIN" ? "원본 출퇴근 기록은 유지하고 보정 이력을 별도로 남깁니다." : "관리자 승인 전까지 대기 상태로 보관되며, 처리 결과는 정정 신청 이력에서 확인할 수 있습니다."}
        error={correctionError ?? undefined}
        onClose={() => setIsCorrectionDialogOpen(false)}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void (effectiveMode === "ADMIN" ? createCorrection() : submitCorrectionRequest());
        }}
        open={isCorrectionDialogOpen}
        submitLabel={effectiveMode === "ADMIN" ? "보정 저장" : "정정 신청"}
        title={effectiveMode === "ADMIN" ? "근태 기록 보정" : "근태 정정 신청"}
      >
        <RequestField label="보정 대상">
          <select value={correctionDraft.type} onChange={(event) => setCorrectionDraft((current) => ({ ...current, type: event.target.value as CorrectionType }))}>
            <option value="CLOCK_IN_CORRECTION">출근 시각</option>
            <option value="CLOCK_OUT_CORRECTION">퇴근 시각</option>
            <option value="APPROVED_LATE">인정지각</option>
            <option value="APPROVED_EARLY_LEAVE">인정조퇴</option>
          </select>
        </RequestField>
        <RequestField label="보정 시각"><input required type="time" value={correctionDraft.afterValue} onChange={(event) => setCorrectionDraft((current) => ({ ...current, afterValue: event.target.value }))} /></RequestField>
        <RequestField label="보정 사유"><textarea required rows={3} value={correctionDraft.reason} onChange={(event) => setCorrectionDraft((current) => ({ ...current, reason: event.target.value }))} /></RequestField>
      </FormDialog>
    </div>
  );
}

function RequestField({ children, label }: { children: ReactNode; label: string }) {
  return <label className="request-field"><span>{label}</span>{children}</label>;
}

function koreaTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce<Record<string, string>>((values, part) => {
    values[part.type] = part.value;
    return values;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
}

function upsertRecord<T extends { id: string }>(records: T[], next: T) {
  return records.some((record) => record.id === next.id)
    ? records.map((record) => record.id === next.id ? next : record)
    : [next, ...records];
}

function formatKoreaTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}

function verificationStatusLabel(status: string) {
  return {
    GPS_PASSED: "GPS 확인 완료",
    GPS_FAILED_ALLOWED: "대체 인증 완료",
    GPS_FAILED_QR_ALLOWED: "QR 인증 완료",
    OUT_OF_RANGE: "근무지 범위 밖",
    MANUAL_REVIEW_REQUIRED: "관리자 확인 필요"
  }[status] ?? status;
}

function humanizeLeaveError(error: unknown, availableDays: number) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Requested leave exceeds the available balance")) {
    return `신청 가능한 연차는 ${formatLeaveDays(availableDays)}입니다. 무급휴가를 선택하거나 관리자에게 연차 보정을 요청해 주세요.`;
  }
  if (message.includes("Half-day leave is not allowed")) {
    return "현재 운영 정책에서는 반차 신청을 허용하지 않습니다.";
  }
  if (message.includes("Leave must be requested in")) {
    return "관리자가 설정한 연차 사용 단위에 맞춰 일수를 입력해 주세요.";
  }
  return message || "휴가 신청을 처리하지 못했습니다.";
}

function buildAdminSelectionSnapshot(
  employee: Employee,
  dashboard: Dashboard,
  workplaceOptions: EmployeeSnapshot["workplaceOptions"]
): EmployeeSnapshot {
  const attendanceRecords = dashboard.todayAttendance.filter((record) => record.employeeId === employee.id);
  const leaveRequests = dashboard.leaveRequests.filter((request) => request.employeeId === employee.id);
  const overtimeRequests = dashboard.overtimeRequests.filter((request) => request.employeeId === employee.id);

  return {
    asOf: dashboard.asOf,
    employee,
    workplaceOptions,
    todayAttendance: attendanceRecords.find((record) => record.date === dashboard.asOf.slice(0, 10)),
    attendanceRecords,
    leaveBalance: getLeaveBalance({
      employee,
      asOf: dashboard.asOf,
      approvedRequests: leaveRequests,
      policy: dashboard.settings ?? defaultSystemPolicy
    }),
    leaveRequests,
    earlyLeaveLedger: [],
    overtimeRequests,
    attendanceCorrections: dashboard.corrections.filter((correction) => correction.employeeId === employee.id),
    payrollStatements: dashboard.activePayrollStatements.filter((statement) => statement.employeeId === employee.id),
    dailyWorkTasks: [],
    recentAuditLogs: dashboard.recentAuditLogs.filter((log) => log.actorId === employee.id || log.targetId.includes(employee.id))
  };
}

function getBrowserCoordinate(): Promise<{ accuracyMeters?: number; latitude: number; longitude: number }> {
  if (!("geolocation" in navigator)) {
    return Promise.reject(new Error("Geolocation is not supported."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy
      }),
      reject,
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 }
    );
  });
}

function renderSection(props: {
  activeSection: ErpActiveSection;
  canAdmin: boolean;
  canManageRoles: boolean;
  clockError: string | null;
  clockFeedback: ClockFeedback | null;
  clockingType: ClockType | null;
  dailyWorkTasks: DailyWorkTask[];
  employeeAccountStates: EmployeeAccountState[];
  employeeCardRows: EmployeeCardRow[];
  employees: Employee[];
  selectedEmployeeId: string;
  employeeViewModel: EmployeeViewModel | null;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onApproveLeave: (requestId?: string, status?: "APPROVED" | "REJECTED") => void;
  onApproveOvertime: (requestId?: string, status?: "APPROVED" | "REJECTED") => void;
  onApproveAttendanceCorrection: (requestId?: string, status?: "APPROVED" | "REJECTED", detail?: string) => void | Promise<void>;
  onCancelLeave: (requestId?: string) => void | Promise<void>;
  onCancelOvertime: (requestId?: string) => void | Promise<void>;
  onCancelAttendanceCorrection: (requestId?: string) => void | Promise<void>;
  onClock: (type: ClockType, method: VerificationMethod, gpsError?: boolean) => void;
  onCreateDailyTaskPlan: (draft: DailyWorkPlanDraft) => Promise<void>;
  onCreateEmployeeAccount: (input: EmployeeAccountCreateInput) => Promise<{ temporaryPassword: string }>;
  onImportEmployeeAccounts: (rows: EmployeeImportRow[]) => Promise<import("./api/types").ImportEmployeeAccountsResult>;
  onUpdateDailyTask: (task: DailyWorkTask) => void;
  onUpdateDailyTaskPlan: (taskId: string, draft: DailyWorkPlanDraft) => Promise<void>;
  onCreateCorrection: () => void;
  onSubmitCorrectionRequest: () => void;
  onDownloadPayroll: (statementId?: string) => void;
  onDeletePayroll: (statementId?: string, deleteReason?: string) => void;
  onUpdateEmployeeCard: () => void;
  onToggleEmployeeSensitiveData: () => void;
  onResetEmployeePassword: (employeeId: string, temporaryPassword: string) => Promise<void>;
  onSetEmployeeAccountAccess: (employeeId: string, enabled: boolean) => Promise<void>;
  onSelectEmployee: (employeeId: string) => void | Promise<void>;
  onUpdateSystemPolicy: (settings: SystemPolicy) => void | Promise<void>;
  onCreateWorkplace: (workplace: Omit<Workplace, "id">) => void | Promise<void>;
  onUpdateWorkplace: (workplaceId: string, patch: Partial<Omit<Workplace, "id">>) => void | Promise<void>;
  onDeleteWorkplace: (workplaceId: string) => void | Promise<void>;
  onSubmitLeave: () => void;
  onSubmitOvertime: () => void;
  onUploadPayroll: () => void;
  isSavingTaskPlan: boolean;
  isRevealingEmployeeSensitiveData: boolean;
  isEmployeeSensitiveDataRevealed: boolean;
  leaveRequests: import("./domain/types").LeaveRequest[];
  correctionRequests: import("./domain/types").AttendanceCorrectionRequest[];
  leaveBalance?: LeaveBalance;
  leaveBalanceAdjustments: import("./domain/types").LeaveBalanceAdjustment[];
  overtimeRequests: import("./domain/types").OvertimeRequest[];
  payrollStatements: PayrollStatement[];
  systemPolicy: SystemPolicy;
  workplaces: import("./domain/types").Workplace[];
  auditLogs: AuditLog[];
  isAuditLoading: boolean;
  taskPlanError: string | null;
}) {
  switch (props.activeSection) {
    case "overview":
      return <AdminOverviewSection erpViewModel={props.erpViewModel} isLoading={props.isLoading} />;
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
      return <SettingsSection {...props} />;
    case "history":
      return <HistorySection auditLogs={props.auditLogs} employees={props.employees} isLoading={props.isAuditLoading} />;
    case "audit":
      return <AuditSection auditLogs={props.auditLogs} employees={props.employees} isLoading={props.isAuditLoading} viewModel={props.erpViewModel} />;
  }
}

function AdminOverviewSection(props: { erpViewModel: ErpViewModel; isLoading: boolean }) {
  return (
    <div className="erp-two-column admin-overview">
      <DetailPanel title="오늘 처리 큐" description="승인·예외·보정처럼 관리자 확인이 필요한 업무를 우선 표시합니다.">
        <DataTable columns={rowColumns} rows={props.erpViewModel.workQueueRows} emptyState={<EmptyState title="오늘 처리할 업무가 없습니다." />} />
      </DetailPanel>
      <DetailPanel title="운영 요약" description="전체 직원의 오늘 상태를 빠르게 확인합니다.">
        <DataTable columns={rowColumns} rows={props.erpViewModel.attendanceRows.slice(0, 10)} emptyState={<EmptyState title="오늘 근태 기록이 없습니다." />} />
      </DetailPanel>
      {props.isLoading ? <p className="sr-only" aria-live="polite">관리자 대시보드를 불러오는 중입니다.</p> : null}
    </div>
  );
}

function LoginScreen(props: {
  authError: string | null;
  isLoading: boolean;
  onLogin: (loginId: string, password: string) => void;
  onRememberChange: (remember: boolean) => void;
  rememberLogin: boolean;
}) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="app-shell login-shell">
      <DetailPanel
        title="사내 근태 관리 로그인"
        description="아이디와 비밀번호로 로그인합니다."
      >
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            props.onLogin(loginId, password);
          }}
        >
          <RequestField label="아이디"><input autoComplete="username" required value={loginId} onChange={(event) => setLoginId(event.target.value)} /></RequestField>
          <RequestField label="비밀번호"><input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></RequestField>
          <label className="checkbox-label">
            <input
              checked={props.rememberLogin}
              onChange={(event) => props.onRememberChange(event.target.checked)}
              type="checkbox"
            />
            로그인 상태 유지
          </label>
          {props.authError ? <InlineNotice title="로그인 실패" tone="danger">{props.authError}</InlineNotice> : null}
          <div className="login-form__actions">
            <button disabled={props.isLoading} type="submit">
              <LogIn size={14} />
              {props.isLoading ? "로그인 확인 중..." : "로그인"}
            </button>
          </div>
        </form>
      </DetailPanel>
    </div>
  );
}

function SelfServiceSection(props: {
  clockError: string | null;
  clockFeedback: ClockFeedback | null;
  clockingType: ClockType | null;
  employeeViewModel: EmployeeViewModel | null;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onClock: (type: ClockType, method: VerificationMethod, gpsError?: boolean) => void;
  onUpdateDailyTask: (task: DailyWorkTask) => void;
  onSubmitLeave: () => void;
  onSubmitOvertime: () => void;
  systemPolicy: SystemPolicy;
}) {
  const employee = props.erpViewModel.employeeSummary;
  const attendance = props.employeeViewModel;
  const dailyTasks = props.erpViewModel.dailyWorkTasks;
  const incompleteTasks = dailyTasks.filter((task) => task.status !== "DONE");
  const completedTasks = dailyTasks.filter((task) => task.status === "DONE");
  const nextClockAction = attendance?.clockInLabel === "출근 기록 없음"
    ? { label: "출근 체크", type: "CLOCK_IN" as const, time: "근무 시작을 기록합니다" }
    : attendance?.clockOutLabel === "퇴근 기록 없음"
      ? { label: "퇴근 체크", type: "CLOCK_OUT" as const, time: "오늘 근무를 마무리합니다" }
      : null;
  const payrollNotice = payrollNoticeForToday(today, props.systemPolicy.payrollHolidayDates);

  return (
    <div className="my-day">
      <section className="my-day__hero" aria-label="오늘의 출퇴근">
        <div className="my-day__intro">
          <p className="eyebrow">{formatToday(today)} · {employee.department}</p>
          <h2>{employee.name}님, 오늘도 반갑습니다.</h2>
          <p>{nextClockAction?.time ?? "오늘 출퇴근 기록이 모두 완료되었습니다."} · 기본 근무 {props.systemPolicy.workStartTime}~{props.systemPolicy.workEndTime}</p>
        </div>
        <div className="attendance-check-area">
          {nextClockAction ? (
            <button
              className="attendance-check"
              disabled={props.isLoading || props.clockingType !== null}
              onClick={() => props.onClock(nextClockAction.type, "GPS")}
            >
              <CircleCheck size={24} />
              <span>{props.clockingType ? "위치와 시간을 확인하는 중" : nextClockAction.label}</span>
            </button>
          ) : (
            <div className="attendance-complete"><Check size={20} /> 오늘 근태 완료</div>
          )}
          {nextClockAction ? (
            <div className="attendance-alternatives">
              <span>GPS가 어렵다면</span>
              <button disabled={props.isLoading || props.clockingType !== null} onClick={() => props.onClock(nextClockAction.type, "QR", true)} title="QR 인증">
                <QrCode size={15} /> QR
              </button>
              <button disabled={props.isLoading || props.clockingType !== null} onClick={() => props.onClock(nextClockAction.type, "MANUAL_CLICK", true)} title="수동 인증">
                <TimerReset size={15} /> 수동
              </button>
            </div>
          ) : null}
          {props.clockFeedback ? (
            <div className="attendance-feedback" role="status">
              <Check aria-hidden="true" size={16} />
              <strong>{props.clockFeedback.label}</strong>
              <span>{props.clockFeedback.time} · {props.clockFeedback.status}</span>
            </div>
          ) : null}
          {props.clockError ? <p className="attendance-error" role="alert">{props.clockError}</p> : null}
        </div>
        <dl className="attendance-summary">
          <div><dt>출근</dt><dd>{attendance?.clockInLabel ?? "--:--"}</dd></div>
          <div><dt>퇴근</dt><dd>{attendance?.clockOutLabel ?? "--:--"}</dd></div>
          <div><dt>상태</dt><dd>{attendance?.statusLabel ?? "기록 준비 중"}</dd></div>
        </dl>
      </section>

      <div className="my-day__content">
        <DetailPanel
          title={employee.department === "제작팀" ? "오늘의 제작 플랜" : "오늘의 업무 계획"}
          description={employee.department === "제작팀" ? "현장·편집·납품 순서로 오늘의 제작 흐름을 확인합니다." : "우선순위에 따라 내 담당 업무를 처리합니다."}
        >
          <div className="task-progress">
            <strong>내 작업 {dailyTasks.length}건</strong>
            <span>완료 {completedTasks.length} · 남음 {incompleteTasks.length}</span>
          </div>
          <div className="daily-task-list">
            {dailyTasks.map((task) => (
              <article className={`daily-task is-${task.status.toLowerCase()}`} key={task.id}>
                <button
                  aria-label={`${task.title} ${task.status === "DONE" ? "완료 취소" : "완료 처리"}`}
                  className="task-check"
                  disabled={props.isLoading}
                  onClick={() => props.onUpdateDailyTask(task)}
                >
                  {task.status === "DONE" ? <Check size={16} /> : null}
                </button>
                <div>
                  <strong>{task.title}</strong>
                  <span>{taskPlanHint(task)}</span>
                </div>
                <small>{task.dueLabel}</small>
              </article>
            ))}
            {dailyTasks.length === 0 ? <EmptyState title="오늘 배정된 작업이 없습니다." /> : null}
          </div>
        </DetailPanel>

        <div className="my-day__aside">
          <DetailPanel title="내 일정" description="자주 쓰는 신청만 간단히 처리합니다.">
            <div className="quick-actions">
              <button disabled={props.isLoading} onClick={props.onSubmitLeave}>
                <CalendarDays size={18} />
                <span><strong>휴가 신청</strong><small>{attendance?.leaveAvailableLabel ?? "잔여 연차 확인"}</small></span>
              </button>
              <button disabled={props.isLoading} onClick={props.onSubmitOvertime}>
                <Clock size={18} />
                <span><strong>야근 신청</strong><small>예정 시간을 미리 등록</small></span>
              </button>
            </div>
            <dl className="request-status-list">
              <div><dt>휴가</dt><dd>{attendance?.pendingLeaveSummary ?? "신청 현황 확인 중"}</dd></div>
              <div><dt>야근</dt><dd>{attendance?.pendingOvertimeSummary ?? "신청 현황 확인 중"}</dd></div>
              <div><dt>근태 정정</dt><dd>{attendance?.correctionSummary ?? "신청 현황 확인 중"}</dd></div>
            </dl>
          </DetailPanel>
          <DetailPanel title="급여명세서" description={payrollNotice.description}>
            <div className={`payroll-notice ${payrollNotice.isNoticeDay ? "is-active" : ""}`}>
              <FileText size={18} />
              <div><strong>{payrollNotice.title}</strong><span>{attendance?.payrollSummary ?? "명세서 정보를 불러오는 중"}</span></div>
            </div>
          </DetailPanel>
        </div>
      </div>
    </div>
  );
}

function EmployeeCardSection(props: {
  canAdmin: boolean;
  employeeAccountStates: EmployeeAccountState[];
  employeeCardRows: EmployeeCardRow[];
  employees: Employee[];
  erpViewModel: ErpViewModel;
  leaveBalance?: LeaveBalance;
  leaveBalanceAdjustments: import("./domain/types").LeaveBalanceAdjustment[];
  isLoading: boolean;
  onSelectEmployee: (employeeId: string) => void | Promise<void>;
  onUpdateEmployeeCard: () => void;
  onToggleEmployeeSensitiveData: () => void;
  isRevealingEmployeeSensitiveData: boolean;
  isEmployeeSensitiveDataRevealed: boolean;
  selectedEmployeeId: string;
}) {
  const leaveAdjustmentRows: ErpViewModelRow[] = props.leaveBalanceAdjustments.map((adjustment) => ({
    id: adjustment.id,
    label: new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(adjustment.createdAt)),
    value: `${adjustment.days > 0 ? "+" : ""}${adjustment.days}일 · ${adjustment.reason}`,
    meta: `처리자 ${props.employees.find((employee) => employee.id === adjustment.createdBy)?.name ?? adjustment.createdBy}`,
    status: adjustment.days > 0 ? "APPROVED" : "REJECTED"
  }));
  return (
    <div className="people-workspace">
      <EmployeeDirectory
        accountStates={props.employeeAccountStates}
        busy={props.isLoading}
        employees={props.employees}
        onSelect={props.onSelectEmployee}
        selectedEmployeeId={props.selectedEmployeeId}
      />
      <div className="people-workspace__detail">
        <DetailPanel
          title={`${props.erpViewModel.employeeSummary.name} 인사기록 카드`}
          description="기본 인사정보와 급여·퇴직·소득공제 항목을 함께 관리합니다."
          actions={
            <InlineActions>
              <button disabled={props.isLoading || props.isRevealingEmployeeSensitiveData} onClick={props.onToggleEmployeeSensitiveData} type="button">
                {props.isEmployeeSensitiveDataRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                {props.isEmployeeSensitiveDataRevealed ? "민감정보 숨기기" : "민감정보 열람"}
              </button>
              <button disabled={props.isLoading} onClick={props.onUpdateEmployeeCard}>
                <BadgeCheck size={14} />
                인사카드 편집
              </button>
            </InlineActions>
          }
        >
          <DataTable columns={employeeCardColumns} rows={props.employeeCardRows} emptyState={<EmptyState title="직원카드 없음" />} />
        </DetailPanel>
        <DetailPanel title="연차 현황" description="선택 직원의 발생·보정·사용 가능 일수와 최근 신청을 확인합니다.">
          <div className="employee-leave-summary">
            <div><span>법정 발생</span><strong>{formatLeaveDays(props.leaveBalance?.statutoryDays)}</strong></div>
            <div><span>선사용 부여</span><strong>{formatLeaveDays(props.leaveBalance?.advanceGrantedDays)}</strong></div>
            <div><span>HR 보정</span><strong>{formatLeaveDays(props.employees.find((employee) => employee.id === props.selectedEmployeeId)?.annualLeaveAdjustmentDays ?? 0)}</strong></div>
            <div className="is-primary"><span>사용 가능</span><strong>{formatLeaveDays(props.leaveBalance?.availableDays)}</strong></div>
          </div>
          <DataTable columns={rowColumns} rows={props.erpViewModel.leaveRows.filter((row) => row.label === props.erpViewModel.employeeSummary.name).slice(0, 8)} emptyState={<EmptyState title="휴가 신청 이력 없음" />} />
        </DetailPanel>
        <DetailPanel title="연차 보정 처리 이력" description="직원카드에서 변경한 HR 보정의 처리 사유와 시각을 다시 확인합니다.">
          <DataTable columns={rowColumns} rows={leaveAdjustmentRows} emptyState={<EmptyState title="연차 보정 이력 없음" />} />
        </DetailPanel>
      </div>
    </div>
  );
}

function AttendanceSection(props: {
  canAdmin: boolean;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onCreateCorrection: () => void;
  onSubmitCorrectionRequest: () => void;
  onCancelAttendanceCorrection: (requestId?: string) => void | Promise<void>;
}) {
  const [dateFilter, setDateFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const attendanceRows = filterRowsForMode(props.erpViewModel.attendanceRows, props.erpViewModel.employeeSummary.name, props.canAdmin)
    .filter((row) => !dateFilter || row.meta.startsWith(dateFilter))
    .filter((row) => !employeeFilter || row.label === employeeFilter);
  const correctionRows = filterRowsForMode(props.erpViewModel.correctionRows, props.erpViewModel.employeeSummary.name, props.canAdmin);
  const correctionRequestRows = filterRowsForMode(props.erpViewModel.correctionRequestRows, props.erpViewModel.employeeSummary.name, props.canAdmin);
  const pendingCorrectionRequest = correctionRequestRows.find((row) => row.status === "PENDING");

  return (
    <div className="erp-two-column">
      <DetailPanel
        title="출퇴근 인증 내역"
        description="GPS 실패 시 QR과 수동 클릭을 동등하게 허용하고 이력을 남깁니다."
        actions={
          <InlineActions>
            <button disabled={props.isLoading} onClick={props.canAdmin ? props.onCreateCorrection : props.onSubmitCorrectionRequest}>
              {props.canAdmin ? "인정지각 보정" : "근태 정정 신청"}
            </button>
            {!props.canAdmin && pendingCorrectionRequest ? <button disabled={props.isLoading} onClick={() => void props.onCancelAttendanceCorrection(pendingCorrectionRequest.id)}>대기 신청 취소</button> : null}
          </InlineActions>
        }
      >
        {props.canAdmin ? (
          <div className="attendance-report-filters" aria-label="근태 기록 필터">
            <label><span>일자</span><input aria-label="근태 기록 일자" onChange={(event) => setDateFilter(event.target.value)} type="date" value={dateFilter} /></label>
            <label><span>직원</span><select aria-label="근태 기록 직원" onChange={(event) => setEmployeeFilter(event.target.value)} value={employeeFilter}><option value="">전체 직원</option>{Array.from(new Set(props.erpViewModel.attendanceRows.map((row) => row.label))).sort().map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            {(dateFilter || employeeFilter) ? <button onClick={() => { setDateFilter(""); setEmployeeFilter(""); }} type="button">필터 초기화</button> : null}
            <span className="attendance-report-filters__count">{attendanceRows.length}건</span>
          </div>
        ) : null}
        <DataTable columns={rowColumns} rows={attendanceRows} emptyState={<EmptyState title="기록 없음" />} />
      </DetailPanel>

      <DetailPanel title={props.canAdmin ? "보정 및 정정 신청 이력" : "나의 정정 신청 이력"} description="원본 기록은 유지하고 신청·승인·반려 결과를 함께 보존합니다.">
        <DataTable columns={rowColumns} rows={[...correctionRequestRows, ...correctionRows]} emptyState={<EmptyState title="보정 및 정정 신청 이력 없음" />} />
      </DetailPanel>
    </div>
  );
}

function ApprovalsSection(props: {
  canAdmin: boolean;
  dailyWorkTasks: DailyWorkTask[];
  employees: Employee[];
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  isSavingTaskPlan: boolean;
  leaveRequests: import("./domain/types").LeaveRequest[];
  correctionRequests: import("./domain/types").AttendanceCorrectionRequest[];
  overtimeRequests: import("./domain/types").OvertimeRequest[];
  onApproveLeave: (requestId?: string, status?: "APPROVED" | "REJECTED", detail?: string) => void | Promise<void>;
  onApproveOvertime: (requestId?: string, status?: "APPROVED" | "REJECTED", detail?: string) => void | Promise<void>;
  onApproveAttendanceCorrection: (requestId?: string, status?: "APPROVED" | "REJECTED", detail?: string) => void | Promise<void>;
  onCreateDailyTaskPlan: (draft: DailyWorkPlanDraft) => Promise<void>;
  onUpdateDailyTaskPlan: (taskId: string, draft: DailyWorkPlanDraft) => Promise<void>;
  taskPlanError: string | null;
}) {
  return (
    <div className="admin-operations-stack">
      <ApprovalQueue
        busy={props.isLoading}
        employees={props.employees}
        leaveRequests={props.leaveRequests}
        overtimeRequests={props.overtimeRequests}
        correctionRequests={props.correctionRequests}
        onApprove={(item: ApprovalQueueItem) => item.kind === "leave"
          ? props.onApproveLeave(item.request.id)
          : item.kind === "overtime"
            ? props.onApproveOvertime(item.request.id)
            : props.onApproveAttendanceCorrection(item.request.id)}
        onReject={(item: ApprovalQueueItem, reason: string) => item.kind === "leave"
          ? props.onApproveLeave(item.request.id, "REJECTED", reason)
          : item.kind === "overtime"
            ? props.onApproveOvertime(item.request.id, "REJECTED", reason)
            : props.onApproveAttendanceCorrection(item.request.id, "REJECTED", reason)}
      />
      {props.canAdmin ? (
        <DailyWorkPlanManager
          busy={props.isSavingTaskPlan}
          employees={props.employees}
          error={props.taskPlanError}
          onCreate={props.onCreateDailyTaskPlan}
          onUpdate={props.onUpdateDailyTaskPlan}
          tasks={props.dailyWorkTasks}
        />
      ) : null}
    </div>
  );
}

function LeaveSection(props: {
  canAdmin: boolean;
  employeeViewModel: EmployeeViewModel | null;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onSubmitLeave: () => void;
  onCancelLeave: (requestId?: string) => void | Promise<void>;
  onApproveLeave: (requestId?: string, status?: "APPROVED" | "REJECTED") => void;
}) {
  const leaveRows = filterRowsForMode(props.erpViewModel.leaveRows, props.erpViewModel.employeeSummary.name, props.canAdmin);
  const firstPendingId = leaveRows.find((row) => row.status === "PENDING")?.id;

  return (
    <div className="admin-operations-stack">
      {!props.canAdmin ? (
        <div className="employee-balance-strip">
          <div className="is-primary"><span>현재 잔여</span><strong>{props.employeeViewModel?.leaveAvailableLabel ?? "연차 확인 중"}</strong></div>
          <div><span>선사용</span><strong>{props.employeeViewModel?.advanceLeaveLabel ?? "-"}</strong></div>
          <div><span>승인 대기</span><strong>{props.employeeViewModel?.pendingLeaveSummary ?? "-"}</strong></div>
        </div>
      ) : null}
      <DetailPanel
      title="휴가 장부"
      description={props.canAdmin ? "전체 직원의 신청 현황을 확인합니다. 처리는 승인함에서 일괄 관리합니다." : "내 휴가 신청과 처리 상태를 확인합니다."}
      actions={
        <InlineActions>
          <button disabled={props.isLoading} onClick={props.onSubmitLeave}>
            휴가 신청
          </button>
          {!props.canAdmin ? (
            <button disabled={props.isLoading || !firstPendingId} onClick={() => props.onCancelLeave(firstPendingId)}>
              신청 취소
            </button>
          ) : null}
        </InlineActions>
      }
    >
      <DataTable columns={rowColumns} rows={leaveRows} emptyState={<EmptyState title="휴가 신청 없음" />} />
      </DetailPanel>
    </div>
  );
}

function OvertimeSection(props: {
  canAdmin: boolean;
  employeeViewModel: EmployeeViewModel | null;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onSubmitOvertime: () => void;
  onCancelOvertime: (requestId?: string) => void | Promise<void>;
  onApproveOvertime: (requestId?: string, status?: "APPROVED" | "REJECTED") => void;
}) {
  const overtimeRows = filterRowsForMode(props.erpViewModel.overtimeRows, props.erpViewModel.employeeSummary.name, props.canAdmin);
  const firstPendingId = overtimeRows.find((row) => row.status === "PENDING")?.id;

  return (
    <div className="admin-operations-stack">
      {!props.canAdmin ? (
        <div className="employee-balance-strip">
          <div className="is-primary"><span>신청 현황</span><strong>{props.employeeViewModel?.pendingOvertimeSummary ?? "야근 확인 중"}</strong></div>
          <div><span>상계 결과</span><strong>{props.employeeViewModel?.offsetLabel ?? "-"}</strong></div>
          <div><span>수당 대상</span><strong>{props.employeeViewModel?.overtimeSummary ?? "-"}</strong></div>
        </div>
      ) : null}
      <DetailPanel
      title="야근·상계"
      description={props.canAdmin ? "평달 야근은 조기퇴근 누적분과 상계합니다. 승인과 수당 인정은 승인함에서 처리합니다." : "평달 야근은 조기퇴근 누적분과 상계하고, 관리자 인정분만 수당 집계 대상으로 표시합니다."}
      actions={
        <InlineActions>
          <button disabled={props.isLoading} onClick={props.onSubmitOvertime}>
            야근 신청
          </button>
          {!props.canAdmin ? (
            <button disabled={props.isLoading || !firstPendingId} onClick={() => props.onCancelOvertime(firstPendingId)}>
              신청 취소
            </button>
          ) : null}
        </InlineActions>
      }
    >
      <DataTable columns={rowColumns} rows={overtimeRows} emptyState={<EmptyState title="야근 신청 없음" />} />
      </DetailPanel>
    </div>
  );
}

function PayrollSection(props: {
  canAdmin: boolean;
  erpViewModel: ErpViewModel;
  isLoading: boolean;
  onUploadPayroll: () => void;
  onDownloadPayroll: (statementId?: string) => void;
  onDeletePayroll: (statementId?: string, deleteReason?: string) => void;
  payrollStatements: PayrollStatement[];
}) {
  return (
    <div className="admin-operations-stack">
      {props.canAdmin ? (
        <InlineActions>
          <button disabled={props.isLoading} onClick={props.onUploadPayroll}>
            <Upload size={14} />
            명세서 업로드
          </button>
        </InlineActions>
      ) : null}
      <PayrollStatementManager
        busy={props.isLoading}
        mode={props.canAdmin ? "admin" : "employee"}
        onDelete={props.canAdmin ? (statement, reason) => props.onDeletePayroll(statement.id, reason) : undefined}
        onDownload={(statement) => props.onDownloadPayroll(statement.id)}
        statements={props.payrollStatements}
      />
    </div>
  );
}

function SettingsSection(props: {
  canAdmin: boolean;
  canManageRoles: boolean;
  employeeAccountStates: EmployeeAccountState[];
  employees: Employee[];
  isLoading: boolean;
  onCreateEmployeeAccount: (input: EmployeeAccountCreateInput) => Promise<{ temporaryPassword: string }>;
  onImportEmployeeAccounts: (rows: EmployeeImportRow[]) => Promise<import("./api/types").ImportEmployeeAccountsResult>;
  onResetEmployeePassword: (employeeId: string, temporaryPassword: string) => Promise<void>;
  onSetEmployeeAccountAccess: (employeeId: string, enabled: boolean) => Promise<void>;
  onUpdateSystemPolicy: (settings: SystemPolicy) => void | Promise<void>;
  systemPolicy: SystemPolicy;
  workplaces: Workplace[];
  onCreateWorkplace: (workplace: Omit<Workplace, "id">) => void | Promise<void>;
  onUpdateWorkplace: (workplaceId: string, patch: Partial<Omit<Workplace, "id">>) => void | Promise<void>;
  onDeleteWorkplace: (workplaceId: string) => void | Promise<void>;
}) {
  return (
    <div className="admin-operations-stack">
      <EmployeeAccountManager
        accountStates={props.employeeAccountStates}
        busy={props.isLoading}
        canManageAdminRoles={props.canManageRoles}
        employees={props.employees}
        onCreate={props.onCreateEmployeeAccount}
        onImport={props.onImportEmployeeAccounts}
        onResetPassword={props.onResetEmployeePassword}
        onSetEnabled={props.onSetEmployeeAccountAccess}
        workplaces={props.workplaces}
      />
      {props.canAdmin ? (
        <SystemPolicyEditor
          busy={props.isLoading}
          onSave={props.onUpdateSystemPolicy}
          settings={props.systemPolicy}
        />
      ) : null}
      {props.canAdmin ? (
        <WorkplaceManager
          busy={props.isLoading}
          onCreate={props.onCreateWorkplace}
          onDelete={props.onDeleteWorkplace}
          onUpdate={props.onUpdateWorkplace}
          workplaces={props.workplaces}
        />
      ) : null}
    </div>
  );
}

function HistorySection({ auditLogs, employees, isLoading }: { auditLogs: AuditLog[]; employees: Employee[]; isLoading: boolean }) {
  return (
    <div className="erp-two-column">
      <AuditLogExplorer auditLogs={auditLogs} employees={employees} variant="history" />
      {isLoading ? <p className="sr-only" aria-live="polite">처리 이력을 불러오는 중입니다.</p> : null}
    </div>
  );
}

function AuditSection({ auditLogs, employees, isLoading, viewModel }: { auditLogs: AuditLog[]; employees: Employee[]; isLoading: boolean; viewModel: ErpViewModel }) {
  return (
    <div className="erp-two-column">
      <AuditLogExplorer auditLogs={auditLogs} employees={employees} />
      <DetailPanel title="보정 확인" description="보정 이력은 별도 행으로도 확인합니다.">
        <DataTable columns={rowColumns} rows={viewModel.correctionRows} emptyState={<EmptyState title="보정 없음" />} />
      </DetailPanel>
      {isLoading ? <p className="sr-only" aria-live="polite">감사 로그를 불러오는 중입니다.</p> : null}
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
    correctionRequests: snapshot.attendanceCorrectionRequests ?? [],
    earlyLeaveTotalMinutes: snapshot.earlyLeaveLedger.reduce((sum, entry) => sum + entry.minutes, 0),
    overtimeOffset: snapshot.overtimeOffset ?? null,
    payrollStatements: snapshot.payrollStatements
  };
}

function sectionTitle(section: ErpActiveSection) {
  const titles: Record<ErpActiveSection, string> = {
    overview: "관리자 대시보드",
    "self-service": "직원 셀프서비스",
    "employee-card": "인사 관리",
    attendance: "근태/보정",
    approvals: "승인 업무 큐",
    leave: "휴가/연차",
    overtime: "야근/상계",
    payroll: "급여명세서",
    settings: "설정/정책",
    history: "처리 이력",
    audit: "감사 로그"
  };

  return titles[section];
}

function sectionFromLocation(): ErpActiveSection {
  if (typeof window === "undefined") return "self-service";
  const candidate = new URLSearchParams(window.location.search).get("section");
  const sections: ErpActiveSection[] = ["overview", "self-service", "employee-card", "attendance", "approvals", "leave", "overtime", "payroll", "settings", "history", "audit"];
  return sections.includes(candidate as ErpActiveSection) ? candidate as ErpActiveSection : "self-service";
}

function formatToday(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatLeaveDays(value: number | undefined) {
  return value === undefined ? "-" : `${value.toLocaleString("ko-KR")}일`;
}

function leaveTypeLabel(type: LeaveType) {
  return ({
    ANNUAL: "연차",
    HALF_DAY: "반차",
    SPECIAL: "특별휴가",
    UNPAID: "무급휴가"
  } satisfies Record<LeaveType, string>)[type];
}

function overtimeSummary(draft: OvertimeDraft) {
  if (!draft.date || !draft.startsAt || !draft.endsAt) return "날짜와 시작·종료 시각을 입력해 주세요.";
  const startsAt = Date.parse(`${draft.date}T${draft.startsAt}:00+09:00`);
  const endsAt = Date.parse(`${draft.date}T${draft.endsAt}:00+09:00`);
  const minutes = Math.round((endsAt - startsAt) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return "종료 시각은 시작 시각 이후여야 합니다.";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const duration = [hours ? `${hours}시간` : "", remainingMinutes ? `${remainingMinutes}분` : ""].filter(Boolean).join(" ");
  return `${draft.date} · ${draft.startsAt} ~ ${draft.endsAt} · ${duration}`;
}

function payrollNoticeForToday(value: string, additionalHolidayDates: readonly string[] = []) {
  const noticeDate = payrollNoticeDate(value, additionalHolidayDates);
  const isNoticeDay = isPayrollNoticeDay(value, additionalHolidayDates);
  return {
    isNoticeDay,
    title: isNoticeDay ? "이번 달 급여명세서를 확인하세요" : "급여명세서 안내",
    description: isNoticeDay ? "오늘 열람 알림이 도착했습니다." : `매월 10일 또는 직전 근무일(${noticeDate})에 열람 알림을 안내합니다.`
  };
}

function taskPlanHint(task: DailyWorkTask) {
  if (task.status === "DONE") return "완료 처리됨";
  if (task.status === "IN_PROGRESS") return "진행 중";
  return task.department === "제작팀" ? "오늘 제작 플랜의 담당 작업" : "오늘 운영 계획의 담당 작업";
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

function authActorId(session: AuthSession | null, fallbackEmployeeId?: string) {
  return session?.employeeId ?? fallbackEmployeeId ?? "emp-ceo";
}

function readStoredSession(): AuthSession | null {
  try {
    const stored = localStorage.getItem("intranet:auth-session");
    if (!stored || localStorage.getItem("intranet:remember-login") !== "true") {
      return null;
    }

    const parsed = JSON.parse(stored) as AuthSession;
    if (!parsed.employeeId || !parsed.role || !parsed.authenticatedAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
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
