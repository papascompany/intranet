import { useMemo, useState } from "react";
import { ClipboardList, Search, X } from "lucide-react";
import type { AuditLog, Employee } from "../domain/types";
import "./auditLogExplorer.css";

export interface AuditLogExplorerProps {
  auditLogs: readonly AuditLog[];
  employees: readonly Pick<Employee, "id" | "name" | "department">[];
  variant?: "audit" | "history";
}

type Filters = {
  actor: string;
  action: string;
  target: string;
};

const initialFilters: Filters = { actor: "", action: "", target: "" };

function includesText(value: string, query: string) {
  return value.toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR"));
}

function formatActor(log: AuditLog, employees: AuditLogExplorerProps["employees"]) {
  const employee = employees.find((candidate) => candidate.id === log.actorId);
  return employee ? `${employee.name} · ${employee.department}` : log.actorId;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function AuditLogExplorer({ auditLogs, employees, variant = "audit" }: AuditLogExplorerProps) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const filteredLogs = useMemo(() => auditLogs.filter((log) => {
    const actor = formatActor(log, employees);
    const target = `${log.targetType} ${log.targetId} ${log.detail}`;

    return includesText(actor, filters.actor)
      && includesText(log.action, filters.action)
      && includesText(target, filters.target);
  }), [auditLogs, employees, filters]);
  const hasFilters = Boolean(filters.actor || filters.action || filters.target);

  const updateFilter = (field: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  return (
    <section aria-labelledby="audit-log-explorer-title" className="audit-log-explorer">
      <header className="audit-log-explorer__header">
        <div>
          <p className="audit-log-explorer__eyebrow"><ClipboardList aria-hidden="true" /> {variant === "history" ? "업무 처리 기록" : "관리자 기록"}</p>
          <h2 id="audit-log-explorer-title">{variant === "history" ? "처리 이력" : "감사 로그"}</h2>
          <p>{variant === "history" ? "신청·승인·보정·열람 결과를 다시 확인할 수 있습니다." : "계정과 업무 기록을 조건으로 바로 확인할 수 있습니다."}</p>
        </div>
        <output aria-live="polite" className="audit-log-explorer__count">
          {filteredLogs.length}건
        </output>
      </header>

      <div aria-label="감사 로그 필터" className="audit-log-explorer__filters">
        <label>
          수행자
          <input onChange={(event) => updateFilter("actor", event.target.value)} placeholder="이름 또는 부서" type="search" value={filters.actor} />
        </label>
        <label>
          작업
          <input onChange={(event) => updateFilter("action", event.target.value)} placeholder="예: PAYROLL" type="search" value={filters.action} />
        </label>
        <label>
          대상
          <input onChange={(event) => updateFilter("target", event.target.value)} placeholder="유형, ID 또는 상세 사유" type="search" value={filters.target} />
        </label>
        {hasFilters ? (
          <button className="audit-log-explorer__clear" onClick={() => setFilters(initialFilters)} type="button">
            <X aria-hidden="true" /> 초기화
          </button>
        ) : null}
      </div>

      {filteredLogs.length ? (
        <div className="audit-log-explorer__table-wrap">
          <table>
            <caption className="sr-only">필터링된 감사 로그 {filteredLogs.length}건</caption>
            <thead>
              <tr><th scope="col">기록 시각</th><th scope="col">수행자</th><th scope="col">작업</th><th scope="col">대상</th><th scope="col">상세</th></tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td><time dateTime={log.createdAt}>{formatCreatedAt(log.createdAt)}</time></td>
                  <td>{formatActor(log, employees)}</td>
                  <td><code>{variant === "history" ? humanizeAction(log.action) : log.action}</code></td>
                  <td><span>{log.targetType}</span><small>{log.targetId}</small></td>
                  <td>{log.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="audit-log-explorer__empty" role="status">
          <Search aria-hidden="true" />
          <div>
            <h3>{hasFilters ? "조건에 맞는 기록이 없습니다" : "표시할 감사 로그가 없습니다"}</h3>
            <p>{hasFilters ? "검색어를 바꾸거나 필터를 초기화해 다시 확인해 주세요." : "관리자 작업 기록이 생성되면 이곳에서 확인할 수 있습니다."}</p>
          </div>
          {hasFilters ? <button onClick={() => setFilters(initialFilters)} type="button">필터 초기화</button> : null}
        </div>
      )}
    </section>
  );
}

function humanizeAction(action: string) {
  const labels: Record<string, string> = {
    ATTENDANCE_CLOCKED_IN: "출근 처리",
    ATTENDANCE_CLOCKED_OUT: "퇴근 처리",
    ATTENDANCE_CORRECTED: "근태 보정",
    ATTENDANCE_CORRECTION_CREATED: "근태 보정 등록",
    DAILY_WORK_TASK_PLAN_CREATED: "작업 계획 등록",
    DAILY_WORK_TASK_PLAN_UPDATED: "작업 계획 수정",
    DAILY_WORK_TASK_COMPLETED: "작업 완료",
    EMPLOYEE_CARD_UPDATED: "직원카드 수정",
    EMPLOYEE_SENSITIVE_DATA_VIEWED: "민감정보 열람",
    LEAVE_REQUEST_SUBMITTED: "휴가 신청",
    LEAVEREQUEST_APPROVED: "휴가 승인",
    LEAVEREQUEST_REJECTED: "휴가 반려",
    LEAVEREQUEST_CANCELLED: "휴가 취소",
    OVERTIME_REQUEST_SUBMITTED: "야근 신청",
    OVERTIMEREQUEST_APPROVED: "야근 승인",
    OVERTIMEREQUEST_REJECTED: "야근 반려",
    OVERTIMEREQUEST_CANCELLED: "야근 취소",
    OVERTIME_PAY_APPROVED: "야근 수당 인정",
    OVERTIME_PAY_UNAPPROVED: "야근 수당 인정 취소",
    PAYROLL_STATEMENT_REGISTERED: "급여명세서 등록",
    PAYROLL_STATEMENT_DOWNLOADED: "급여명세서 열람",
    PAYROLL_STATEMENT_SOFT_DELETED: "급여명세서 삭제 처리",
    SETTINGS_UPDATED: "운영 정책 수정"
  };
  return labels[action] ?? action;
}
