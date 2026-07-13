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

describe("EmployeeCardEditor", () => {
  it("shows only permitted personal fields for an employee", () => {
    render(<EmployeeCardEditor employee={employee} onClose={vi.fn()} onSubmit={vi.fn()} open />);

    expect(screen.getByRole("dialog", { name: "이정산 직원카드 편집" })).toBeVisible();
    expect(screen.getByLabelText("주소")).toHaveValue("서울시 성동구");
    expect(screen.getByLabelText("급여계좌")).toHaveValue("123-456-789");
    expect(screen.queryByLabelText("연봉")).not.toBeInTheDocument();
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
});
