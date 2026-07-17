import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PayrollStatement } from "../domain/types";
import { PayrollStatementManager } from "./payrollStatementManager";

const statements: PayrollStatement[] = [
  {
    id: "payroll-2026-06",
    employeeId: "employee-1",
    month: "2026-06",
    filename: "2026-06-급여명세서.pdf",
    uploadedAt: "2026-06-10T09:00:00+09:00"
  },
  {
    id: "payroll-2026-05",
    employeeId: "employee-1",
    month: "2026-05",
    filename: "2026-05-급여명세서.pdf",
    uploadedAt: "2026-05-09T09:00:00+09:00"
  }
];

describe("PayrollStatementManager", () => {
  afterEach(cleanup);

  it("lets an employee download their statement without showing deletion controls", () => {
    const onDownload = vi.fn();
    render(<PayrollStatementManager mode="employee" onDownload={onDownload} statements={statements} />);

    expect(screen.getByText("2026년 6월")).toBeVisible();
    expect(screen.queryByRole("button", { name: /삭제/u })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2026년 6월 명세서 다운로드" }));

    expect(onDownload).toHaveBeenCalledWith(statements[0]);
  });

  it("requires a deletion reason before an administrator can delete a statement", () => {
    const onDelete = vi.fn();
    render(<PayrollStatementManager mode="admin" onDelete={onDelete} onDownload={vi.fn()} statements={statements} />);

    fireEvent.click(screen.getByRole("button", { name: "2026년 6월 명세서 삭제" }));
    expect(screen.getByRole("dialog", { name: "급여명세서를 삭제할까요?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "삭제하기" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("삭제 사유"), { target: { value: "정정본 재발행" } });
    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));

    expect(onDelete).toHaveBeenCalledWith(statements[0], "정정본 재발행");
  });

  it("identifies the employee in the administrator's all-staff list", () => {
    render(
      <PayrollStatementManager
        employeeNames={{ "employee-1": "김운영" }}
        mode="admin"
        onDownload={vi.fn()}
        statements={statements}
      />
    );

    expect(screen.getByText("김운영 · 2026-06-급여명세서.pdf")).toBeVisible();
    expect(screen.getAllByText(/employee-1 · 등록일/u)).toHaveLength(2);
  });

  it("does not render soft-deleted statements", () => {
    render(
      <PayrollStatementManager
        mode="employee"
        onDownload={vi.fn()}
        statements={[...statements, { ...statements[1], id: "deleted", month: "2026-04", deletedAt: "2026-04-11T10:00:00+09:00" }]}
      />
    );

    expect(screen.queryByText("2026년 4월")).not.toBeInTheDocument();
    expect(screen.getByLabelText("급여명세서 2건")).toBeVisible();
  });
});
