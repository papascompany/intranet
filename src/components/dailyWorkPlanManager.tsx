import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Pencil, Plus, Users } from "lucide-react";
import { FormDialog, InlineNotice } from "./operational";
import type { DailyWorkTask, DailyWorkTaskStatus, Employee } from "../domain/types";
import "./dailyWorkPlanManager.css";

const statusOptions: Array<{ value: DailyWorkTaskStatus; label: string }> = [
  { value: "TODO", label: "예정" },
  { value: "IN_PROGRESS", label: "진행 중" },
  { value: "DONE", label: "완료" }
];

export type DailyWorkPlanDraft = {
  employeeId: string;
  date: string;
  title: string;
  dueLabel?: string;
  displayOrder: number;
  status: DailyWorkTaskStatus;
};

export type DailyWorkPlanUpdate = DailyWorkPlanDraft;

export interface DailyWorkPlanManagerProps {
  busy?: boolean;
  employees: readonly Pick<Employee, "id" | "name" | "department">[];
  error?: string | null;
  onCreate: (draft: DailyWorkPlanDraft) => void | Promise<void>;
  onUpdate: (taskId: string, update: DailyWorkPlanUpdate) => void | Promise<void>;
  tasks: readonly DailyWorkTask[];
}

type DialogState =
  | { mode: "create"; draft: DailyWorkPlanDraft }
  | { mode: "edit"; taskId: string; draft: DailyWorkPlanDraft }
  | null;

function todayForInput() {
  return new Date().toISOString().slice(0, 10);
}

function newDraft(employees: DailyWorkPlanManagerProps["employees"]): DailyWorkPlanDraft {
  return {
    employeeId: employees[0]?.id ?? "",
    date: todayForInput(),
    title: "",
    dueLabel: "",
    displayOrder: 0,
    status: "TODO"
  };
}

function draftFromTask(task: DailyWorkTask): DailyWorkPlanDraft {
  return {
    employeeId: task.employeeId,
    date: task.date,
    title: task.title,
    dueLabel: task.dueLabel ?? "",
    displayOrder: task.displayOrder,
    status: task.status
  };
}

function employeeName(employees: DailyWorkPlanManagerProps["employees"], employeeId: string) {
  const employee = employees.find((candidate) => candidate.id === employeeId);
  return employee ? `${employee.name} · ${employee.department}` : "배정되지 않음";
}

function statusLabel(status: DailyWorkTaskStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

export function DailyWorkPlanManager({ busy = false, employees, error, onCreate, onUpdate, tasks }: DailyWorkPlanManagerProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dateFilter, setDateFilter] = useState("");

  const visibleTasks = useMemo(
    () => tasks
      .filter((task) => !dateFilter || task.date === dateFilter)
      .slice()
      .sort((left, right) => left.date.localeCompare(right.date) || left.displayOrder - right.displayOrder || left.title.localeCompare(right.title)),
    [dateFilter, tasks]
  );

  const updateDraft = <Key extends keyof DailyWorkPlanDraft>(key: Key, value: DailyWorkPlanDraft[Key]) => {
    setDialog((current) => current ? { ...current, draft: { ...current.draft, [key]: value } } : current);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || busy) return;

    const draft = { ...dialog.draft, dueLabel: dialog.draft.dueLabel?.trim() || undefined, title: dialog.draft.title.trim() };
    if (dialog.mode === "create") {
      await onCreate(draft);
    } else {
      await onUpdate(dialog.taskId, draft);
    }
    setDialog(null);
  };

  return (
    <section className="daily-work-plan-manager" aria-labelledby="daily-work-plan-title">
      <header className="daily-work-plan-manager__toolbar">
        <div>
          <p className="daily-work-plan-manager__eyebrow"><CalendarDays aria-hidden="true" /> 일일 작업계획</p>
          <h2 id="daily-work-plan-title">오늘의 업무 배정</h2>
          <p>담당자와 우선순위, 진행 상태를 관리합니다.</p>
        </div>
        <div className="daily-work-plan-manager__toolbar-actions">
          <label>
            <span>작업일 필터</span>
            <input aria-label="작업일 필터" onChange={(event) => setDateFilter(event.target.value)} type="date" value={dateFilter} />
          </label>
          <button className="daily-work-plan-manager__create" disabled={busy || employees.length === 0} onClick={() => setDialog({ mode: "create", draft: newDraft(employees) })} type="button">
            <Plus aria-hidden="true" /> 작업 배정
          </button>
        </div>
      </header>

      {error ? <InlineNotice className="daily-work-plan-manager__notice" tone="danger" title="작업계획을 저장하지 못했습니다">{error}</InlineNotice> : null}

      <div className="daily-work-plan-manager__summary" aria-label="작업계획 요약">
        <span><Users aria-hidden="true" /> {visibleTasks.length}건</span>
        <span>예정 {visibleTasks.filter((task) => task.status === "TODO").length}</span>
        <span>진행 {visibleTasks.filter((task) => task.status === "IN_PROGRESS").length}</span>
        <span>완료 {visibleTasks.filter((task) => task.status === "DONE").length}</span>
      </div>

      {visibleTasks.length ? (
        <div className="daily-work-plan-manager__list">
          {visibleTasks.map((task) => (
            <article className="daily-work-plan-row" key={task.id}>
              <div className="daily-work-plan-row__order" aria-label={`정렬 순서 ${task.displayOrder}`}>{task.displayOrder}</div>
              <div className="daily-work-plan-row__main">
                <strong>{task.title}</strong>
                <span>{employeeName(employees, task.employeeId)}</span>
              </div>
              <div className="daily-work-plan-row__meta">
                <span>{task.date}</span>
                <span>{task.dueLabel || "마감 표시 없음"}</span>
              </div>
              <span className={`daily-work-plan-row__status is-${task.status.toLowerCase()}`}>{statusLabel(task.status)}</span>
              <button aria-label={`${task.title} 편집`} className="daily-work-plan-row__edit" disabled={busy} onClick={() => setDialog({ mode: "edit", taskId: task.id, draft: draftFromTask(task) })} type="button">
                <Pencil aria-hidden="true" /> <span>편집</span>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="daily-work-plan-manager__empty">선택한 날짜에 배정된 작업이 없습니다.</div>
      )}

      <FormDialog
        busy={busy}
        description="직원에게 표시될 작업계획입니다. 저장 후에도 행별 편집으로 수정할 수 있습니다."
        error={error ?? undefined}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        open={dialog !== null}
        submitDisabled={!dialog?.draft.title.trim() || !dialog?.draft.employeeId || !dialog?.draft.date}
        submitLabel={dialog?.mode === "edit" ? "변경 저장" : "작업 배정"}
        title={dialog?.mode === "edit" ? "작업계획 편집" : "작업 배정"}
      >
        {dialog ? <TaskPlanFields draft={dialog.draft} employees={employees} onChange={updateDraft} /> : null}
      </FormDialog>
    </section>
  );
}

interface TaskPlanFieldsProps {
  draft: DailyWorkPlanDraft;
  employees: DailyWorkPlanManagerProps["employees"];
  onChange: <Key extends keyof DailyWorkPlanDraft>(key: Key, value: DailyWorkPlanDraft[Key]) => void;
}

function TaskPlanFields({ draft, employees, onChange }: TaskPlanFieldsProps) {
  return (
    <div className="daily-work-plan-form">
      <label className="daily-work-plan-form__wide">
        <span>작업 제목</span>
        <input autoComplete="off" onChange={(event) => onChange("title", event.target.value)} placeholder="예: 제품 상세 페이지 시안 검토" required value={draft.title} />
      </label>
      <label>
        <span>작업일</span>
        <input onChange={(event) => onChange("date", event.target.value)} required type="date" value={draft.date} />
      </label>
      <label>
        <span>담당자</span>
        <select onChange={(event) => onChange("employeeId", event.target.value)} required value={draft.employeeId}>
          <option value="" disabled>담당자를 선택하세요</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.department}</option>)}
        </select>
      </label>
      <label>
        <span>마감 표시</span>
        <input onChange={(event) => onChange("dueLabel", event.target.value)} placeholder="예: 15:00까지" value={draft.dueLabel ?? ""} />
      </label>
      <label>
        <span>정렬 순서</span>
        <input min="0" onChange={(event) => onChange("displayOrder", Number(event.target.value))} type="number" value={draft.displayOrder} />
      </label>
      <label className="daily-work-plan-form__wide">
        <span>진행 상태</span>
        <select onChange={(event) => onChange("status", event.target.value as DailyWorkTaskStatus)} value={draft.status}>
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
  );
}
