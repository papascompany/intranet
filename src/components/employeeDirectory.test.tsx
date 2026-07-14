import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "../domain/types";
import { EmployeeDirectory } from "./employeeDirectory";

const employees: Employee[] = [
  { id: "emp-1", name: "김운영", employeeNumber: "O-001", position: "매니저", role: "EMPLOYEE", department: "운영팀", hireDate: "2025-01-02", pilot: false },
  { id: "emp-2", name: "이제작", employeeNumber: "P-002", position: "디자이너", role: "APPROVER", department: "제작팀", hireDate: "2025-02-03", pilot: false }
];

describe("EmployeeDirectory", () => {
  afterEach(cleanup);

  it("filters the complete directory and selects an employee without leaving the workspace", () => {
    const onSelect = vi.fn();
    render(
      <EmployeeDirectory
        accountStates={[{ employeeId: "emp-1", loginId: "ops", enabled: true, passwordChangedAt: "2026-07-01" }]}
        employees={employees}
        onSelect={onSelect}
        selectedEmployeeId="emp-1"
      />
    );

    expect(screen.getByText("김운영")).toBeVisible();
    expect(screen.getByText("이제작")).toBeVisible();
    expect(screen.getByText("사용중")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "제작팀" }));
    expect(screen.queryByText("김운영")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("이제작"));
    expect(onSelect).toHaveBeenCalledWith("emp-2");

    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "직원 검색" }), { target: { value: "O-001" } });
    expect(screen.getByText("김운영")).toBeVisible();
    expect(screen.queryByText("이제작")).not.toBeInTheDocument();
  });
});
