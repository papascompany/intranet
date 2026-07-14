import { useMemo, useState, type FormEvent } from "react";
import { KeyRound, Plus, ShieldCheck, UserPlus, Users } from "lucide-react";
import type { Employee, Role, Workplace } from "../domain/types";
import { FormDialog, InlineNotice } from "./operational";
import "./employeeAccountManager.css";

export type EmployeeAccountEmployee = Pick<Employee, "id" | "name" | "employeeNumber" | "role" | "department" | "hireDate" | "workplaceId">;
export type EmployeeAccountWorkplace = Pick<Workplace, "id" | "name">;

export type EmployeeAccountState = {
  employeeId: string;
  enabled: boolean;
  lastPasswordResetAt?: string;
};

export type EmployeeAccountCreateInput = {
  name: string;
  employeeNumber: string;
  role: Role;
  department: Employee["department"];
  hireDate: string;
  workplaceId: string;
};

export type EmployeeAccountPasswordResult = {
  temporaryPassword: string;
};

export interface EmployeeAccountManagerProps {
  accountStates: readonly EmployeeAccountState[];
  busy?: boolean;
  employees: readonly EmployeeAccountEmployee[];
  onCreate: (input: EmployeeAccountCreateInput) => EmployeeAccountPasswordResult | Promise<EmployeeAccountPasswordResult>;
  onResetPassword: (employeeId: string) => EmployeeAccountPasswordResult | Promise<EmployeeAccountPasswordResult>;
  onSetEnabled: (employeeId: string, enabled: boolean) => void | Promise<void>;
  workplaces: readonly EmployeeAccountWorkplace[];
}

const roles: Array<{ value: Role; label: string }> = [
  { value: "EMPLOYEE", label: "직원" },
  { value: "APPROVER", label: "승인자" },
  { value: "HR_ADMIN", label: "인사 관리자" },
  { value: "SYSTEM_ADMIN", label: "시스템 관리자" }
];

function newDraft(workplaces: readonly EmployeeAccountWorkplace[]): EmployeeAccountCreateInput {
  return { name: "", employeeNumber: "", role: "EMPLOYEE", department: "운영팀", hireDate: "", workplaceId: workplaces[0]?.id ?? "" };
}

function roleLabel(role: Role) {
  return roles.find((option) => option.value === role)?.label ?? role;
}

export function EmployeeAccountManager({ accountStates, busy = false, employees, onCreate, onResetPassword, onSetEnabled, workplaces }: EmployeeAccountManagerProps) {
  const [draft, setDraft] = useState(() => newDraft(workplaces));
  const [createOpen, setCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const isBusy = busy || isSubmitting;

  const stateByEmployeeId = useMemo(() => new Map(accountStates.map((state) => [state.employeeId, state])), [accountStates]);

  const runAction = async (action: () => void | EmployeeAccountPasswordResult | Promise<void | EmployeeAccountPasswordResult>) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await action();
      if (result && "temporaryPassword" in result) setTemporaryPassword(result.temporaryPassword);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;
    const input = { ...draft, name: draft.name.trim(), employeeNumber: draft.employeeNumber.trim() };
    const completed = await runAction(() => onCreate(input));
    if (completed) {
      setCreateOpen(false);
      setDraft(newDraft(workplaces));
    }
  };

  const closeCreate = () => {
    if (!isBusy) {
      setCreateOpen(false);
      setError(null);
    }
  };

  return (
    <section aria-labelledby="employee-account-manager-title" className="employee-account-manager">
      <header className="employee-account-manager__header">
        <div>
          <p className="employee-account-manager__eyebrow"><ShieldCheck aria-hidden="true" /> 인사 관리</p>
          <h2 id="employee-account-manager-title">직원 계정 관리</h2>
          <p>입사자 계정을 발급하고 접근 상태를 관리합니다.</p>
        </div>
        <button className="employee-account-manager__create" disabled={isBusy || workplaces.length === 0} onClick={() => { setError(null); setCreateOpen(true); }} type="button">
          <UserPlus aria-hidden="true" /> 직원 계정 발급
        </button>
      </header>

      {temporaryPassword ? (
        <InlineNotice onDismiss={() => setTemporaryPassword(null)} title="임시 비밀번호가 발급되었습니다" tone="success">
          <span className="employee-account-manager__password">{temporaryPassword}</span>
          <span> 직원에게 안전한 방법으로 전달하고, 첫 로그인 후 변경하도록 안내하세요.</span>
        </InlineNotice>
      ) : null}
      {error && !createOpen ? <InlineNotice title="처리하지 못했습니다" tone="danger">{error}</InlineNotice> : null}

      <div aria-label={`직원 계정 ${employees.length}명`} className="employee-account-manager__summary"><Users aria-hidden="true" /> 등록 계정 {employees.length}명</div>
      {employees.length ? (
        <div className="employee-account-manager__list" role="list">
          {employees.map((employee) => {
            const state = stateByEmployeeId.get(employee.id);
            const enabled = state?.enabled ?? false;
            return (
              <article className="employee-account-row" key={employee.id} role="listitem">
                <div className="employee-account-row__person">
                  <strong>{employee.name}</strong>
                  <span>{employee.employeeNumber ?? "사번 미발급"} · {employee.department} · {roleLabel(employee.role)}</span>
                </div>
                <div className="employee-account-row__meta">
                  <span>입사일 {employee.hireDate}</span>
                  <span className={enabled ? "is-enabled" : "is-disabled"}>{enabled ? "사용 중" : "사용 중지"}</span>
                </div>
                <div className="employee-account-row__actions">
                  <button aria-label={`${employee.name} 비밀번호 재설정`} disabled={isBusy} onClick={() => void runAction(() => onResetPassword(employee.id))} type="button"><KeyRound aria-hidden="true" /> 비밀번호 재설정</button>
                  <button aria-label={`${employee.name} 계정 ${enabled ? "사용 중지" : "사용 설정"}`} className={enabled ? "is-disable" : "is-enable"} disabled={isBusy} onClick={() => void runAction(() => onSetEnabled(employee.id, !enabled))} type="button">
                    {enabled ? "사용 중지" : "사용 설정"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="employee-account-manager__empty">등록된 직원 계정이 없습니다.</div>}

      <FormDialog busy={isBusy} description="기본 인사 정보와 근무지를 입력하면 서버에서 임시 비밀번호를 발급합니다." error={error ?? undefined} onClose={closeCreate} onSubmit={createAccount} open={createOpen} submitDisabled={!draft.name.trim() || !draft.employeeNumber.trim() || !draft.hireDate || !draft.workplaceId} submitLabel="계정 발급" title="직원 계정 발급">
        <div className="employee-account-manager__form">
          <label><span>이름</span><input autoComplete="name" onChange={(event) => setDraft({ ...draft, name: event.target.value })} required value={draft.name} /></label>
          <label><span>사번</span><input autoComplete="off" onChange={(event) => setDraft({ ...draft, employeeNumber: event.target.value })} required value={draft.employeeNumber} /></label>
          <label><span>권한</span><select onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })} value={draft.role}>{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
          <label><span>부서</span><select onChange={(event) => setDraft({ ...draft, department: event.target.value as Employee["department"] })} value={draft.department}><option value="운영팀">운영팀</option><option value="제작팀">제작팀</option></select></label>
          <label><span>입사일</span><input onChange={(event) => setDraft({ ...draft, hireDate: event.target.value })} required type="date" value={draft.hireDate} /></label>
          <label><span>근무지</span><select onChange={(event) => setDraft({ ...draft, workplaceId: event.target.value })} required value={draft.workplaceId}><option disabled value="">근무지를 선택하세요</option>{workplaces.map((workplace) => <option key={workplace.id} value={workplace.id}>{workplace.name}</option>)}</select></label>
        </div>
      </FormDialog>
    </section>
  );
}
