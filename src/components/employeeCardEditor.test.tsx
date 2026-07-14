import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "../domain/types";
import { EmployeeCardEditor } from "./employeeCardEditor";

afterEach(cleanup);

const employee: Employee = {
  id: "employee-1",
  name: "이정산",
  role: "EMPLOYEE",
  department: "운영팀",
  hireDate: "2024-01-02",
  employeeNumber: "P-001",
  position: "매니저",
  birthday: "1990-03-10",
  address: "서울시 성동구",
  mobile: "010-1111-2222",
  emergencyContact: "김보호 010-3333-4444",
  familyRelations: "배우자 1명",
  payrollBank: "국민은행",
  payrollAccount: "123-456-789",
  annualSalary: 42000000,
  severancePay: 3500000,
  incomeDeductionDependents: 2,
  pilot: true
};

const workplaces = [
  { id: "samsong", name: "삼송테크노밸리" },
  { id: "jichuk", name: "에이스하이엔드타워 지축역" }
];

describe("EmployeeCardEditor", () => {
  it("shows only permitted personal fields for an employee", () => {
    render(<EmployeeCardEditor employee={employee} onClose={vi.fn()} onSubmit={vi.fn()} open />);

    expect(screen.getByRole("dialog", { name: "이정산 직원카드 편집" })).toBeVisible();
    expect(screen.getByLabelText("주소")).toHaveValue("서울시 성동구");
    expect(screen.getByLabelText("급여계좌")).toHaveValue("123-456-789");
    expect(screen.queryByLabelText("연봉")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("배정 근무지")).not.toBeInTheDocument();
    expect(screen.queryByText("관리자 전용 정보")).not.toBeInTheDocument();
  });

  it("returns edited basic information through its callback", () => {
    const onSubmit = vi.fn();
    render(<EmployeeCardEditor employee={employee} onClose={vi.fn()} onSubmit={onSubmit} open />);

    fireEvent.change(screen.getByLabelText("휴대전화"), { target: { value: "010-9999-0000" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: "employee-1",
      update: expect.objectContaining({ mobile: "010-9999-0000", address: "서울시 성동구" }),
      reason: undefined
    }));
  });

  it("requires a reason before an administrator can save compensation changes", () => {
    const onSubmit = vi.fn();
    render(<EmployeeCardEditor canAdmin employee={employee} onClose={vi.fn()} onSubmit={onSubmit} open />);

    expect(screen.getByLabelText("연봉")).toHaveValue(42000000);
    fireEvent.change(screen.getByLabelText("연봉"), { target: { value: "45000000" } });
    expect(screen.getByLabelText("관리자 변경 사유")).toBeRequired();
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("관리자 변경 사유"), { target: { value: "연봉 계약 갱신" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      reason: "연봉 계약 갱신",
      update: expect.objectContaining({ annualSalary: 45000000 })
    }));
  });

  it("exposes new administrator employment and leave-adjustment fields with labels", () => {
    render(<EmployeeCardEditor canAdmin employee={employee} onClose={vi.fn()} onSubmit={vi.fn()} open />);

    expect(screen.getByRole("heading", { name: "재직 및 소속" })).toBeVisible();
    expect(screen.getByLabelText("직원구분")).toHaveValue("REGULAR");
    expect(screen.getByLabelText("재직상태")).toHaveValue("ACTIVE");
    expect(screen.getByLabelText("퇴사일")).toHaveValue("");
    expect(screen.getByLabelText("주민등록번호")).toHaveValue("");
    expect(screen.getByLabelText("연차 HR 보정")).toHaveValue(0);
    expect(screen.getByLabelText("연차 HR 보정")).toHaveAttribute("step", "0.5");
  });

  it("submits edited employment details and a negative leave adjustment with an audit reason", () => {
    const onSubmit = vi.fn();
    render(<EmployeeCardEditor canAdmin employee={employee} onClose={vi.fn()} onSubmit={onSubmit} open />);

    fireEvent.change(screen.getByLabelText("직원구분"), { target: { value: "CONTRACT" } });
    fireEvent.change(screen.getByLabelText("재직상태"), { target: { value: "LEAVE" } });
    fireEvent.change(screen.getByLabelText("퇴사일"), { target: { value: "2026-08-31" } });
    fireEvent.change(screen.getByLabelText("주민등록번호"), { target: { value: "900310-1234567" } });
    fireEvent.change(screen.getByLabelText("연차 HR 보정"), { target: { value: "-1.5" } });
    fireEvent.change(screen.getByLabelText("관리자 변경 사유"), { target: { value: "휴직 전환 및 연차 정산" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      reason: "휴직 전환 및 연차 정산",
      update: expect.objectContaining({
        employmentType: "CONTRACT",
        employmentStatus: "LEAVE",
        terminationDate: "2026-08-31",
        residentRegistrationNumber: "900310-1234567",
        annualLeaveAdjustmentDays: -1.5
      })
    }));
  });

  it("keeps the employee number immutable after account creation", () => {
    render(<EmployeeCardEditor canAdmin employee={employee} onClose={vi.fn()} onSubmit={vi.fn()} open />);

    expect(screen.getByLabelText("사번")).toHaveValue("P-001");
    expect(screen.getByLabelText("사번")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("사번")).toBeRequired();
  });

  it("lets an administrator assign a workplace without blocking save on a reason", () => {
    const onSubmit = vi.fn();
    render(<EmployeeCardEditor canAdmin employee={employee} onClose={vi.fn()} onSubmit={onSubmit} open workplaces={workplaces} />);

    expect(screen.getByLabelText("배정 근무지")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("배정 근무지"), { target: { value: "jichuk" } });

    expect(screen.getByLabelText("관리자 변경 사유")).not.toBeRequired();
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      reason: undefined,
      update: expect.objectContaining({ workplaceId: "jichuk" })
    }));
  });

  it("normalizes database timestamps for date inputs and keeps save available", () => {
    const onSubmit = vi.fn();
    const timestampEmployee = {
      ...employee,
      hireDate: "2018-04-09T00:00:00.000Z",
      birthday: "1990-03-10T00:00:00.000Z"
    };
    render(<EmployeeCardEditor canAdmin employee={timestampEmployee} onClose={vi.fn()} onSubmit={onSubmit} open workplaces={workplaces} />);

    expect(screen.getByLabelText("입사일")).toHaveValue("2018-04-09");
    expect(screen.getByLabelText("생일")).toHaveValue("1990-03-10");
    fireEvent.change(screen.getByLabelText("직위"), { target: { value: "과장" } });
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeEnabled();
  });

  it("fills missing administrator custom fields without crashing", () => {
    const incompleteEmployee = { ...employee, customAdminFields: [] as never };
    render(<EmployeeCardEditor canAdmin employee={incompleteEmployee} onClose={vi.fn()} onSubmit={vi.fn()} open workplaces={workplaces} />);

    expect(screen.getByLabelText("항목명 1")).toHaveValue("관리자 항목 1");
    expect(screen.getByLabelText("항목명 5")).toHaveValue("관리자 항목 5");
    fireEvent.change(screen.getByLabelText("직위"), { target: { value: "과장" } });
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeEnabled();
  });

  it("submits a null workplace when an administrator clears an existing assignment", () => {
    const onSubmit = vi.fn();
    const assignedEmployee = { ...employee, workplaceId: "samsong" };
    render(<EmployeeCardEditor canAdmin employee={assignedEmployee} onClose={vi.fn()} onSubmit={onSubmit} open workplaces={workplaces} />);

    expect(screen.getByLabelText("배정 근무지")).toHaveValue("samsong");
    fireEvent.change(screen.getByLabelText("배정 근무지"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("관리자 변경 사유"), { target: { value: "근무지 미지정 전환" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ workplaceId: null })
    }));
  });
});
