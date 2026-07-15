import { useMemo, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck, Upload, UserPlus, Users } from "lucide-react";
import type { ImportEmployeeAccountsResult } from "../api/types";
import type { Employee, Role, Workplace } from "../domain/types";
import { parseEmployeeCsv, type EmployeeImportRow } from "../features/employeeCsv";
import { FormDialog, InlineNotice } from "./operational";
import "./employeeAccountManager.css";

export type EmployeeAccountEmployee = Pick<Employee, "id" | "name" | "employeeNumber" | "role" | "department" | "hireDate" | "workplaceId">;
export type EmployeeAccountWorkplace = Pick<Workplace, "id" | "name">;

export type EmployeeAccountState = {
  employeeId: string;
  loginId: string;
  enabled: boolean;
  lastPasswordResetAt?: string;
};

export type EmployeeAccountCreateInput = {
  name: string;
  loginId: string;
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
  canManageAdminRoles?: boolean;
  employees: readonly EmployeeAccountEmployee[];
  onCreate: (input: EmployeeAccountCreateInput) => EmployeeAccountPasswordResult | Promise<EmployeeAccountPasswordResult>;
  onResetPassword: (employeeId: string, temporaryPassword: string) => void | EmployeeAccountPasswordResult | Promise<void | EmployeeAccountPasswordResult>;
  onSetEnabled: (employeeId: string, enabled: boolean) => void | Promise<void>;
  onImport: (rows: EmployeeImportRow[]) => Promise<ImportEmployeeAccountsResult>;
  workplaces: readonly EmployeeAccountWorkplace[];
}

const roles: Array<{ value: Role; label: string }> = [
  { value: "EMPLOYEE", label: "직원" },
  { value: "APPROVER", label: "승인자" },
  { value: "HR_ADMIN", label: "인사 관리자" },
  { value: "SYSTEM_ADMIN", label: "시스템 관리자" }
];

function newDraft(workplaces: readonly EmployeeAccountWorkplace[]): EmployeeAccountCreateInput {
  return { name: "", loginId: "", employeeNumber: "", role: "EMPLOYEE", department: "운영팀", hireDate: "", workplaceId: workplaces[0]?.id ?? "" };
}

function roleLabel(role: Role) {
  return roles.find((option) => option.value === role)?.label ?? role;
}

async function readTextFile(file: File) {
  if (typeof file.text === "function") return await file.text();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("CSV 파일을 읽지 못했습니다."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}

export function EmployeeAccountManager({ accountStates, busy = false, canManageAdminRoles = false, employees, onCreate, onResetPassword, onSetEnabled, onImport, workplaces }: EmployeeAccountManagerProps) {
  const [draft, setDraft] = useState(() => newDraft(workplaces));
  const [createOpen, setCreateOpen] = useState(false);
  const [resetEmployee, setResetEmployee] = useState<EmployeeAccountEmployee | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<EmployeeImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importedCredentials, setImportedCredentials] = useState<ImportEmployeeAccountsResult["created"]>([]);
  const isBusy = busy || isSubmitting;
  const availableRoles = canManageAdminRoles ? roles : roles.filter((role) => role.value === "EMPLOYEE" || role.value === "APPROVER");

  const stateByEmployeeId = useMemo(() => new Map(accountStates.map((state) => [state.employeeId, state])), [accountStates]);

  const runAction = async (action: () => void | EmployeeAccountPasswordResult | Promise<void | EmployeeAccountPasswordResult>, displayTemporaryPassword = false) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await action();
      if (displayTemporaryPassword && result && "temporaryPassword" in result) setTemporaryPassword(result.temporaryPassword);
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
    const input = { ...draft, name: draft.name.trim(), loginId: draft.loginId.trim().toLowerCase(), employeeNumber: draft.employeeNumber.trim() };
    const completed = await runAction(() => onCreate(input), true);
    if (completed) {
      setCreateOpen(false);
      setDraft(newDraft(workplaces));
    }
  };

  const resetAccountPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy || !resetEmployee || resetPassword.length < 12 || resetPassword !== resetPasswordConfirmation) return;
    const completed = await runAction(() => onResetPassword(resetEmployee.id, resetPassword));
    if (completed) closeResetPassword();
  };

  const closeCreate = () => {
    if (!isBusy) {
      setCreateOpen(false);
      setError(null);
    }
  };

  const openResetPassword = (employee: EmployeeAccountEmployee) => {
    setError(null);
    setResetPassword("");
    setResetPasswordConfirmation("");
    setResetEmployee(employee);
  };

  const closeResetPassword = () => {
    if (!isBusy) {
      setResetEmployee(null);
      setResetPassword("");
      setResetPasswordConfirmation("");
      setError(null);
    }
  };

  const resetPasswordIsValid = resetPassword.length >= 12 && resetPassword === resetPasswordConfirmation;

  const prepareImport = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const rows = parseEmployeeCsv(await readTextFile(file), workplaces);
      setImportRows(rows);
      setImportFileName(file.name);
      setImportOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "직원명부 CSV를 읽지 못했습니다.");
    }
  };

  const importAccounts = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy || !importRows.length) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await onImport(importRows);
      setImportedCredentials(result.created);
      setImportRows([]);
      setImportOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "직원 계정을 일괄 발급하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
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
        <div className="employee-account-manager__header-actions">
          <label className="employee-account-manager__import"><Upload aria-hidden="true" size={15} /> 직원명부 CSV<input accept=".csv,text/csv" aria-label="직원명부 CSV 선택" disabled={isBusy || workplaces.length === 0} onChange={(event) => { void prepareImport(event.target.files?.[0] ?? null); event.target.value = ""; }} type="file" /></label>
          <button className="employee-account-manager__create" disabled={isBusy || workplaces.length === 0} onClick={() => { setError(null); setCreateOpen(true); }} type="button">
            <UserPlus aria-hidden="true" /> 직원 계정 발급
          </button>
        </div>
      </header>

      {temporaryPassword ? (
        <InlineNotice onDismiss={() => setTemporaryPassword(null)} title="임시 비밀번호가 발급되었습니다" tone="success">
          <span className="employee-account-manager__password">{temporaryPassword}</span>
          <span> 직원에게 안전한 방법으로 전달하고, 첫 로그인 후 변경하도록 안내하세요.</span>
        </InlineNotice>
      ) : null}
      {importedCredentials.length ? (
        <InlineNotice onDismiss={() => setImportedCredentials([])} title="직원 계정이 발급되었습니다" tone="success">
          <div className="employee-account-manager__import-result">
            <p>아래 임시 비밀번호는 이번 화면에서만 확인할 수 있습니다. 직원에게 안전한 방법으로 전달하세요.</p>
            <table><thead><tr><th>이름</th><th>아이디</th><th>1회성 비밀번호</th></tr></thead><tbody>{importedCredentials.map((item) => <tr key={item.employee.id}><td>{item.employee.name}</td><td>{item.loginId}</td><td><code>{item.temporaryPassword}</code></td></tr>)}</tbody></table>
          </div>
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
                  <span>{state?.loginId ?? "아이디 미발급"} · {employee.department} · {roleLabel(employee.role)}</span>
                </div>
                <div className="employee-account-row__meta">
                  <span>입사일 {employee.hireDate}</span>
                  <span className={enabled ? "is-enabled" : "is-disabled"}>{enabled ? "사용 중" : "사용 중지"}</span>
                </div>
                <div className="employee-account-row__actions">
                  <button aria-label={`${employee.name} 비밀번호 재설정`} disabled={isBusy} onClick={() => openResetPassword(employee)} type="button"><KeyRound aria-hidden="true" /> 비밀번호 재설정</button>
                  <button aria-label={`${employee.name} 계정 ${enabled ? "사용 중지" : "사용 설정"}`} className={enabled ? "is-disable" : "is-enable"} disabled={isBusy} onClick={() => void runAction(() => onSetEnabled(employee.id, !enabled))} type="button">
                    {enabled ? "사용 중지" : "사용 설정"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="employee-account-manager__empty">등록된 직원 계정이 없습니다.</div>}

      <FormDialog busy={isBusy} description="기본 인사 정보와 근무지를 입력하면 서버에서 임시 비밀번호를 발급합니다." error={error ?? undefined} onClose={closeCreate} onSubmit={createAccount} open={createOpen} submitDisabled={!draft.name.trim() || !draft.loginId.trim() || !draft.employeeNumber.trim() || !draft.hireDate || !draft.workplaceId} submitLabel="계정 발급" title="직원 계정 발급">
        <div className="employee-account-manager__form">
          <label><span>이름</span><input autoComplete="name" onChange={(event) => setDraft({ ...draft, name: event.target.value })} required value={draft.name} /></label>
          <label><span>로그인 아이디</span><input autoCapitalize="none" autoComplete="username" onChange={(event) => setDraft({ ...draft, loginId: event.target.value })} required value={draft.loginId} /></label>
          <label><span>사번</span><input autoComplete="off" onChange={(event) => setDraft({ ...draft, employeeNumber: event.target.value })} required value={draft.employeeNumber} /></label>
          <label><span>권한</span><select onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })} value={draft.role}>{availableRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
          <label><span>부서</span><select onChange={(event) => setDraft({ ...draft, department: event.target.value as Employee["department"] })} value={draft.department}><option value="운영팀">운영팀</option><option value="제작팀">제작팀</option></select></label>
          <label><span>입사일</span><input onChange={(event) => setDraft({ ...draft, hireDate: event.target.value })} required type="date" value={draft.hireDate} /></label>
          <label><span>근무지</span><select onChange={(event) => setDraft({ ...draft, workplaceId: event.target.value })} required value={draft.workplaceId}><option disabled value="">근무지를 선택하세요</option>{workplaces.map((workplace) => <option key={workplace.id} value={workplace.id}>{workplace.name}</option>)}</select></label>
        </div>
      </FormDialog>

      <FormDialog busy={isBusy} description={`${resetEmployee?.name ?? "직원"}님의 임시 비밀번호를 직접 설정합니다. 12자 이상으로 입력하고 안전한 방법으로 전달하세요.`} error={error ?? undefined} onClose={closeResetPassword} onSubmit={resetAccountPassword} open={Boolean(resetEmployee)} submitDisabled={!resetPasswordIsValid} submitLabel="비밀번호 재설정" title="임시 비밀번호 설정">
        <div className="employee-account-manager__form">
          <label><span>임시 비밀번호</span><input autoComplete="new-password" minLength={12} onChange={(event) => setResetPassword(event.target.value)} required type="password" value={resetPassword} /></label>
          <label><span>임시 비밀번호 확인</span><input autoComplete="new-password" minLength={12} onChange={(event) => setResetPasswordConfirmation(event.target.value)} required type="password" value={resetPasswordConfirmation} /></label>
          {resetPassword && resetPassword.length < 12 ? <p className="employee-account-manager__password-help">임시 비밀번호는 12자 이상이어야 합니다.</p> : null}
          {resetPasswordConfirmation && resetPassword !== resetPasswordConfirmation ? <p className="employee-account-manager__password-help">임시 비밀번호가 일치하지 않습니다.</p> : null}
        </div>
      </FormDialog>

      <FormDialog busy={isBusy} description={`${importFileName} · ${importRows.length}명의 직원 계정을 발급합니다. 아이디·사번·근무지 중복을 서버에서 다시 검증합니다.`} error={error ?? undefined} onClose={() => { if (!isBusy) { setImportOpen(false); setImportRows([]); } }} onSubmit={importAccounts} open={importOpen} submitDisabled={!importRows.length} submitLabel="계정 일괄 발급" title="직원명부 가져오기">
        <div className="employee-account-manager__import-preview">
          <strong>가져올 직원 {importRows.length}명</strong>
          <div className="employee-account-manager__import-table-wrap"><table><thead><tr><th>행</th><th>이름</th><th>아이디</th><th>사번</th><th>근무지</th></tr></thead><tbody>{importRows.map((row) => <tr key={`${row.rowNumber}-${row.loginId}`}><td>{row.rowNumber}</td><td>{row.employee.name}</td><td>{row.loginId}</td><td>{row.employee.employeeNumber}</td><td>{workplaces.find((workplace) => workplace.id === row.employee.workplaceId)?.name ?? row.employee.workplaceId}</td></tr>)}</tbody></table></div>
        </div>
      </FormDialog>
    </section>
  );
}
