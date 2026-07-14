import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Employee, EmployeeCustomAdminFields } from "../domain/types";
import type { EmployeeCardAdminUpdate, EmployeeCardBasicUpdate, EmployeeCardUpdateInput } from "../features/employeeCardUpdate";
import { FormDialog, InlineNotice } from "./operational";
import "./employeeCardEditor.css";

type EditableBasicField = "birthday" | "address" | "mobile" | "emergencyContact" | "familyRelations" | "payrollBank" | "payrollAccount";

export type EmployeeCardEditorSubmit = {
  employeeId: string;
  update: EmployeeCardUpdateInput & { workplaceId?: string | null };
  reason?: string;
};

export type EmployeeCardEditorWorkplace = {
  id: string;
  name: string;
};

export interface EmployeeCardEditorProps {
  busy?: boolean;
  canAdmin?: boolean;
  canManageRoles?: boolean;
  employee: Employee;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: EmployeeCardEditorSubmit) => void | Promise<void>;
  open: boolean;
  workplaces?: EmployeeCardEditorWorkplace[];
}

type BasicDraft = Record<EditableBasicField, string>;

type AdminDraft = {
  name: string;
  employeeNumber: string;
  department: Employee["department"];
  position: string;
  role: Employee["role"];
  hireDate: string;
  terminationDate: string;
  residentRegistrationNumber: string;
  employmentStatus: NonNullable<Employee["employmentStatus"]>;
  employmentType: NonNullable<Employee["employmentType"]>;
  annualSalary: string;
  severancePay: string;
  incomeDeductionDependents: string;
  annualLeaveAdjustmentDays: string;
  customAdminFields: EmployeeCustomAdminFields;
};

const editableBasicFields: ReadonlyArray<{ key: EditableBasicField; label: string; type?: "date" | "tel" }> = [
  { key: "birthday", label: "생일", type: "date" },
  { key: "address", label: "주소" },
  { key: "mobile", label: "휴대전화", type: "tel" },
  { key: "emergencyContact", label: "비상연락처", type: "tel" },
  { key: "familyRelations", label: "가족관계" },
  { key: "payrollBank", label: "급여은행" },
  { key: "payrollAccount", label: "급여계좌" }
];

function defaultCustomFields(): EmployeeCustomAdminFields {
  return [1, 2, 3, 4, 5].map((index) => ({
    id: `custom-admin-field-${index}` as EmployeeCustomAdminFields[number]["id"],
    label: `관리자 항목 ${index}`,
    value: ""
  })) as EmployeeCustomAdminFields;
}

function basicDraftFrom(employee: Employee): BasicDraft {
  return {
    birthday: dateInputValue(employee.birthday),
    address: employee.address ?? "",
    mobile: employee.mobile ?? "",
    emergencyContact: employee.emergencyContact ?? "",
    familyRelations: employee.familyRelations ?? "",
    payrollBank: employee.payrollBank ?? "",
    payrollAccount: employee.payrollAccount ?? ""
  };
}

function adminDraftFrom(employee: Employee): AdminDraft {
  return {
    name: employee.name,
    employeeNumber: employee.employeeNumber ?? "",
    department: employee.department,
    position: employee.position ?? "",
    role: employee.role,
    hireDate: dateInputValue(employee.hireDate),
    terminationDate: dateInputValue(employee.terminationDate),
    residentRegistrationNumber: employee.residentRegistrationNumber ?? "",
    employmentStatus: employee.employmentStatus ?? "ACTIVE",
    employmentType: employee.employmentType ?? "REGULAR",
    annualSalary: employee.annualSalary === undefined ? "" : String(employee.annualSalary),
    severancePay: employee.severancePay === undefined ? "" : String(employee.severancePay),
    incomeDeductionDependents: employee.incomeDeductionDependents === undefined ? "" : String(employee.incomeDeductionDependents),
    annualLeaveAdjustmentDays: employee.annualLeaveAdjustmentDays === undefined ? "0" : String(employee.annualLeaveAdjustmentDays),
    customAdminFields: (employee.customAdminFields ?? defaultCustomFields()).map((field) => ({ ...field })) as EmployeeCustomAdminFields
  };
}

function dateInputValue(value: string | undefined) {
  return value?.slice(0, 10) ?? "";
}

function optionalNumber(value: string) {
  return value.trim() === "" ? undefined : Number(value);
}

function adminFieldsChanged(employee: Employee, draft: AdminDraft) {
  const initial = adminDraftFrom(employee);
  return initial.name !== draft.name
    || initial.employeeNumber !== draft.employeeNumber
    || initial.department !== draft.department
    || initial.position !== draft.position
    || initial.role !== draft.role
    || initial.hireDate !== draft.hireDate
    || initial.terminationDate !== draft.terminationDate
    || initial.residentRegistrationNumber !== draft.residentRegistrationNumber
    || initial.employmentStatus !== draft.employmentStatus
    || initial.employmentType !== draft.employmentType
    || initial.annualSalary !== draft.annualSalary
    || initial.severancePay !== draft.severancePay
    || initial.incomeDeductionDependents !== draft.incomeDeductionDependents
    || initial.annualLeaveAdjustmentDays !== draft.annualLeaveAdjustmentDays
    || initial.customAdminFields.some((field, index) => field.label !== draft.customAdminFields[index].label || field.value !== draft.customAdminFields[index].value);
}

function basicFieldsChanged(employee: Employee, draft: BasicDraft) {
  const initial = basicDraftFrom(employee);
  return (Object.keys(initial) as EditableBasicField[]).some((key) => initial[key] !== draft[key]);
}

function sensitiveAdminFieldsChanged(employee: Employee, draft: AdminDraft) {
  const initial = adminDraftFrom(employee);
  return initial.name !== draft.name
    || initial.role !== draft.role
    || initial.employmentStatus !== draft.employmentStatus
    || initial.hireDate !== draft.hireDate
    || initial.terminationDate !== draft.terminationDate
    || initial.residentRegistrationNumber !== draft.residentRegistrationNumber
    || initial.annualSalary !== draft.annualSalary
    || initial.severancePay !== draft.severancePay
    || initial.incomeDeductionDependents !== draft.incomeDeductionDependents
    || initial.annualLeaveAdjustmentDays !== draft.annualLeaveAdjustmentDays
    || initial.customAdminFields.some((field, index) => field.label !== draft.customAdminFields[index].label || field.value !== draft.customAdminFields[index].value);
}

function adminUpdateFrom(draft: AdminDraft): EmployeeCardUpdateInput {
  return {
    name: draft.name.trim(),
    employeeNumber: draft.employeeNumber.trim(),
    department: draft.department,
    position: draft.position.trim(),
    role: draft.role,
    hireDate: draft.hireDate,
    terminationDate: draft.terminationDate || undefined,
    residentRegistrationNumber: draft.residentRegistrationNumber.trim(),
    employmentStatus: draft.employmentStatus,
    employmentType: draft.employmentType,
    annualSalary: optionalNumber(draft.annualSalary),
    severancePay: optionalNumber(draft.severancePay),
    incomeDeductionDependents: optionalNumber(draft.incomeDeductionDependents),
    annualLeaveAdjustmentDays: optionalNumber(draft.annualLeaveAdjustmentDays),
    customAdminFields: draft.customAdminFields.map((field) => ({ ...field, label: field.label.trim(), value: field.value.trim() })) as EmployeeCustomAdminFields
  };
}

function workplaceIdFrom(employee: Employee) {
  return (employee as Employee & { workplaceId?: string }).workplaceId ?? "";
}

export function EmployeeCardEditor({
  busy = false,
  canAdmin = false,
  canManageRoles = false,
  employee,
  error,
  onClose,
  onSubmit,
  open,
  workplaces = []
}: EmployeeCardEditorProps) {
  const [basicDraft, setBasicDraft] = useState(() => basicDraftFrom(employee));
  const [adminDraft, setAdminDraft] = useState(() => adminDraftFrom(employee));
  const [workplaceId, setWorkplaceId] = useState(() => workplaceIdFrom(employee));
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setBasicDraft(basicDraftFrom(employee));
    setAdminDraft(adminDraftFrom(employee));
    setWorkplaceId(workplaceIdFrom(employee));
    setReason("");
  }, [employee, open]);

  const hasAdminChanges = useMemo(
    () => canAdmin && (adminFieldsChanged(employee, adminDraft) || basicFieldsChanged(employee, basicDraft) || workplaceId !== workplaceIdFrom(employee)),
    [adminDraft, basicDraft, canAdmin, employee, workplaceId]
  );
  const requiresReason = canAdmin && sensitiveAdminFieldsChanged(employee, adminDraft);
  const hasInvalidAdminNumbers = canAdmin && [adminDraft.annualSalary, adminDraft.severancePay, adminDraft.incomeDeductionDependents]
    .some((value) => value.trim() !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0));
  const hasInvalidLeaveAdjustment = canAdmin && adminDraft.annualLeaveAdjustmentDays.trim() !== "" && !Number.isFinite(Number(adminDraft.annualLeaveAdjustmentDays));
  const hasMissingAdminRequired = canAdmin && (!adminDraft.name.trim() || !adminDraft.employeeNumber.trim() || !adminDraft.hireDate);
  const hasUnnamedCustomField = canAdmin && adminDraft.customAdminFields.some((field) => !field.label.trim());

  const updateBasic = (key: EditableBasicField, value: string) => setBasicDraft((current) => ({ ...current, [key]: value }));
  const updateAdmin = <Key extends Exclude<keyof AdminDraft, "customAdminFields">>(key: Key, value: AdminDraft[Key]) => {
    setAdminDraft((current) => ({ ...current, [key]: value }));
  };
  const updateCustomField = (index: number, key: "label" | "value", value: string) => {
    setAdminDraft((current) => ({
      ...current,
      customAdminFields: current.customAdminFields.map((field, fieldIndex) => fieldIndex === index ? { ...field, [key]: value } : field) as EmployeeCustomAdminFields
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || hasInvalidAdminNumbers || hasInvalidLeaveAdjustment || hasMissingAdminRequired || hasUnnamedCustomField || (requiresReason && !reason.trim())) return;

    const update: EmployeeCardBasicUpdate & Partial<EmployeeCardAdminUpdate> = { ...basicDraft };
    if (canAdmin) {
      Object.assign(update, adminUpdateFrom(adminDraft));
      if (workplaceId !== workplaceIdFrom(employee)) {
        Object.assign(update, { workplaceId: workplaceId || null });
      }
    }
    await onSubmit({ employeeId: employee.id, update, reason: reason.trim() || undefined });
  };

  return (
    <FormDialog
      busy={busy}
      description={canAdmin ? "재직·소속·민감정보·급여·연차 보정을 한 화면에서 관리합니다." : "본인 연락처와 급여 지급 정보를 최신 상태로 관리합니다."}
      error={error ?? undefined}
      onClose={onClose}
      onSubmit={submit}
      open={open}
      submitDisabled={hasInvalidAdminNumbers || hasInvalidLeaveAdjustment || hasMissingAdminRequired || hasUnnamedCustomField || (requiresReason && !reason.trim())}
      submitLabel="변경 저장"
      title={`${employee.name} 직원카드 편집`}
    >
      <div className="employee-card-editor">
        <InlineNotice tone="info" title={canAdmin ? "관리자 인사기록" : "수정 가능 항목"}>
          {canAdmin ? "민감정보 열람과 모든 인사정보 변경은 감사 로그에 기록됩니다." : "주소, 연락처, 가족관계, 급여 지급 계좌만 직접 변경할 수 있습니다."}
        </InlineNotice>
        <section aria-labelledby="employee-card-basic-title" className="employee-card-editor__section">
          <h3 id="employee-card-basic-title">기본 정보</h3>
          <div className="employee-card-editor__grid">
            {editableBasicFields.map((field) => (
              <label className={field.key === "address" ? "employee-card-editor__wide" : undefined} key={field.key}>
                <span>{field.label}</span>
                <input
                  autoComplete={field.key === "address" ? "street-address" : field.key === "mobile" ? "tel" : "off"}
                  onChange={(event) => updateBasic(field.key, event.target.value)}
                  type={field.type ?? "text"}
                  value={basicDraft[field.key]}
                />
              </label>
            ))}
          </div>
        </section>

        {canAdmin ? (
          <section aria-labelledby="employee-card-admin-title" className="employee-card-editor__section employee-card-editor__admin">
            <h3 id="employee-card-admin-title">재직 및 소속</h3>
            <div className="employee-card-editor__grid">
              <label><span>이름</span><input onChange={(event) => updateAdmin("name", event.target.value)} required value={adminDraft.name} /></label>
              <label><span>사번</span><input aria-describedby="employee-number-note" aria-label="사번" readOnly required value={adminDraft.employeeNumber} /><small id="employee-number-note">계정 식별값이므로 생성 후 변경할 수 없습니다.</small></label>
              <label><span>부서</span><select onChange={(event) => updateAdmin("department", event.target.value as Employee["department"])} value={adminDraft.department}><option value="운영팀">운영팀</option><option value="제작팀">제작팀</option></select></label>
              <label><span>직위</span><input onChange={(event) => updateAdmin("position", event.target.value)} value={adminDraft.position} /></label>
              <label><span>권한</span><select disabled={!canManageRoles} onChange={(event) => updateAdmin("role", event.target.value as Employee["role"])} value={adminDraft.role}><option value="EMPLOYEE">직원</option><option value="APPROVER">승인자</option><option value="HR_ADMIN">HR 관리자</option><option value="SYSTEM_ADMIN">시스템 관리자</option></select></label>
              <label><span>직원구분</span><select onChange={(event) => updateAdmin("employmentType", event.target.value as AdminDraft["employmentType"])} value={adminDraft.employmentType}><option value="REGULAR">정규직</option><option value="CONTRACT">계약직</option><option value="PART_TIME">시간제</option></select></label>
              <label><span>재직상태</span><select onChange={(event) => updateAdmin("employmentStatus", event.target.value as AdminDraft["employmentStatus"])} value={adminDraft.employmentStatus}><option value="ACTIVE">재직</option><option value="LEAVE">휴직</option><option value="TERMINATED">퇴사</option></select></label>
              <label><span>입사일</span><input onChange={(event) => updateAdmin("hireDate", event.target.value)} required type="date" value={adminDraft.hireDate} /></label>
              <label><span>퇴사일</span><input onChange={(event) => updateAdmin("terminationDate", event.target.value)} type="date" value={adminDraft.terminationDate} /></label>
              <label><span>주민등록번호</span><input autoComplete="off" onChange={(event) => updateAdmin("residentRegistrationNumber", event.target.value)} value={adminDraft.residentRegistrationNumber} /></label>
              <label>
                <span>배정 근무지</span>
                <select aria-label="배정 근무지" onChange={(event) => setWorkplaceId(event.target.value)} value={workplaceId}>
                  <option value="">미지정</option>
                  {workplaces.map((workplace) => <option key={workplace.id} value={workplace.id}>{workplace.name}</option>)}
                </select>
              </label>
            </div>
            <h3>급여 및 연차</h3>
            <div className="employee-card-editor__grid">
              <NumericField label="연봉" onChange={(value) => updateAdmin("annualSalary", value)} value={adminDraft.annualSalary} />
              <NumericField label="퇴직금" onChange={(value) => updateAdmin("severancePay", value)} value={adminDraft.severancePay} />
              <NumericField label="소득공제 부양가족 수" onChange={(value) => updateAdmin("incomeDeductionDependents", value)} value={adminDraft.incomeDeductionDependents} />
              <NumericField allowNegative label="연차 HR 보정" onChange={(value) => updateAdmin("annualLeaveAdjustmentDays", value)} step="0.5" value={adminDraft.annualLeaveAdjustmentDays} />
            </div>
            <div className="employee-card-editor__custom-fields">
              <h4>사용자 항목</h4>
              {adminDraft.customAdminFields.map((field, index) => (
                <div className="employee-card-editor__custom-row" key={field.id}>
                  <label>
                    <span>항목명 {index + 1}</span>
                    <input onChange={(event) => updateCustomField(index, "label", event.target.value)} required value={field.label} />
                  </label>
                  <label>
                    <span>{field.label || `항목 ${index + 1}`} 값</span>
                    <input onChange={(event) => updateCustomField(index, "value", event.target.value)} value={field.value} />
                  </label>
                </div>
              ))}
            </div>
            {hasAdminChanges ? (
              <label className="employee-card-editor__reason">
                <span>관리자 변경 사유 {requiresReason ? "(필수)" : "(선택)"}</span>
                <textarea aria-label="관리자 변경 사유" onChange={(event) => setReason(event.target.value)} placeholder={requiresReason ? "민감정보·급여·권한 변경 사유를 입력하세요." : "필요한 경우 변경 사유를 남기세요."} required={requiresReason} value={reason} />
              </label>
            ) : null}
          </section>
        ) : null}
      </div>
    </FormDialog>
  );
}

function NumericField({ allowNegative = false, label, onChange, step, value }: { allowNegative?: boolean; label: string; onChange: (value: string) => void; step?: string; value: string }) {
  return (
    <label>
      <span>{label}</span>
      <input min={allowNegative ? undefined : "0"} onChange={(event) => onChange(event.target.value)} step={step} type="number" value={value} />
    </label>
  );
}
