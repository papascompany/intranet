import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Employee, EmployeeCustomAdminFields } from "../domain/types";
import type { EmployeeCardAdminUpdate, EmployeeCardBasicUpdate, EmployeeCardUpdateInput } from "../features/employeeCardUpdate";
import { FormDialog, InlineNotice } from "./operational";
import "./employeeCardEditor.css";

type EditableBasicField = "birthday" | "address" | "mobile" | "emergencyContact" | "familyRelations" | "payrollBank" | "payrollAccount";

export type EmployeeCardEditorSubmit = {
  employeeId: string;
  update: EmployeeCardUpdateInput;
  reason?: string;
};

export interface EmployeeCardEditorProps {
  busy?: boolean;
  canAdmin?: boolean;
  employee: Employee;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: EmployeeCardEditorSubmit) => void | Promise<void>;
  open: boolean;
}

type BasicDraft = Record<EditableBasicField, string>;

type AdminDraft = {
  annualSalary: string;
  severancePay: string;
  incomeDeductionDependents: string;
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
    birthday: employee.birthday ?? "",
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
    annualSalary: employee.annualSalary === undefined ? "" : String(employee.annualSalary),
    severancePay: employee.severancePay === undefined ? "" : String(employee.severancePay),
    incomeDeductionDependents: employee.incomeDeductionDependents === undefined ? "" : String(employee.incomeDeductionDependents),
    customAdminFields: (employee.customAdminFields ?? defaultCustomFields()).map((field) => ({ ...field })) as EmployeeCustomAdminFields
  };
}

function optionalNumber(value: string) {
  return value.trim() === "" ? undefined : Number(value);
}

function adminFieldsChanged(employee: Employee, draft: AdminDraft) {
  const initial = adminDraftFrom(employee);
  return initial.annualSalary !== draft.annualSalary
    || initial.severancePay !== draft.severancePay
    || initial.incomeDeductionDependents !== draft.incomeDeductionDependents
    || initial.customAdminFields.some((field, index) => field.label !== draft.customAdminFields[index].label || field.value !== draft.customAdminFields[index].value);
}

function adminUpdateFrom(draft: AdminDraft): EmployeeCardAdminUpdate {
  return {
    annualSalary: optionalNumber(draft.annualSalary),
    severancePay: optionalNumber(draft.severancePay),
    incomeDeductionDependents: optionalNumber(draft.incomeDeductionDependents),
    customAdminFields: draft.customAdminFields.map((field) => ({ ...field, label: field.label.trim(), value: field.value.trim() })) as EmployeeCustomAdminFields
  };
}

export function EmployeeCardEditor({
  busy = false,
  canAdmin = false,
  employee,
  error,
  onClose,
  onSubmit,
  open
}: EmployeeCardEditorProps) {
  const [basicDraft, setBasicDraft] = useState(() => basicDraftFrom(employee));
  const [adminDraft, setAdminDraft] = useState(() => adminDraftFrom(employee));
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setBasicDraft(basicDraftFrom(employee));
    setAdminDraft(adminDraftFrom(employee));
    setReason("");
  }, [employee, open]);

  const hasAdminChanges = useMemo(() => canAdmin && adminFieldsChanged(employee, adminDraft), [adminDraft, canAdmin, employee]);
  const hasInvalidAdminNumbers = canAdmin && [adminDraft.annualSalary, adminDraft.severancePay, adminDraft.incomeDeductionDependents]
    .some((value) => value.trim() !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0));
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
    if (busy || hasInvalidAdminNumbers || hasUnnamedCustomField || (hasAdminChanges && !reason.trim())) return;

    const update: EmployeeCardBasicUpdate & Partial<EmployeeCardAdminUpdate> = { ...basicDraft };
    if (canAdmin) Object.assign(update, adminUpdateFrom(adminDraft));
    await onSubmit({ employeeId: employee.id, update, reason: hasAdminChanges ? reason.trim() : undefined });
  };

  return (
    <FormDialog
      busy={busy}
      description="본인 연락처와 급여 지급 정보를 최신 상태로 관리합니다. 주민등록번호와 인사 발령 정보는 인사 담당자에게 요청해 주세요."
      error={error ?? undefined}
      onClose={onClose}
      onSubmit={submit}
      open={open}
      submitDisabled={hasInvalidAdminNumbers || hasUnnamedCustomField || (hasAdminChanges && !reason.trim())}
      submitLabel="변경 저장"
      title={`${employee.name} 직원카드 편집`}
    >
      <div className="employee-card-editor">
        <InlineNotice tone="info" title="수정 가능 항목">주소, 연락처, 가족관계, 급여 지급 계좌만 직접 변경할 수 있습니다.</InlineNotice>
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
            <h3 id="employee-card-admin-title">관리자 전용 정보</h3>
            <div className="employee-card-editor__grid">
              <NumericField label="연봉" onChange={(value) => updateAdmin("annualSalary", value)} value={adminDraft.annualSalary} />
              <NumericField label="퇴직금" onChange={(value) => updateAdmin("severancePay", value)} value={adminDraft.severancePay} />
              <NumericField label="소득공제 부양가족 수" onChange={(value) => updateAdmin("incomeDeductionDependents", value)} value={adminDraft.incomeDeductionDependents} />
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
                <span>관리자 변경 사유</span>
                <textarea onChange={(event) => setReason(event.target.value)} placeholder="급여 또는 관리자 항목 변경 사유를 입력하세요." required value={reason} />
              </label>
            ) : null}
          </section>
        ) : null}
      </div>
    </FormDialog>
  );
}

function NumericField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label>
      <span>{label}</span>
      <input min="0" onChange={(event) => onChange(event.target.value)} type="number" value={value} />
    </label>
  );
}
