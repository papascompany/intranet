import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLogExplorer } from "./auditLogExplorer";

const employees = [
  { id: "emp-1", name: "김운영", department: "운영팀" as const },
  { id: "emp-2", name: "박인사", department: "제작팀" as const }
];
const auditLogs = [
  { id: "audit-1", actorId: "emp-1", action: "PAYROLL_VIEWED", targetType: "PayrollStatement", targetId: "pay-2026-07", createdAt: "2026-07-10T09:10:00+09:00", detail: "본인 급여명세서 열람" },
  { id: "audit-2", actorId: "emp-2", action: "ATTENDANCE_CORRECTED", targetType: "AttendanceRecord", targetId: "att-2026-07-09", createdAt: "2026-07-10T11:30:00+09:00", detail: "인정 지각 보정" }
];

describe("AuditLogExplorer", () => {
  afterEach(cleanup);

  it("shows audit rows with employee identity and an announced result count", () => {
    render(<AuditLogExplorer auditLogs={auditLogs} employees={employees} />);

    expect(screen.getByText("2건")).toBeVisible();
    expect(screen.getByText("김운영 · 운영팀")).toBeVisible();
    expect(screen.getByText("ATTENDANCE_CORRECTED")).toBeVisible();
  });

  it("filters by actor, action, and target text without a date filter", () => {
    render(<AuditLogExplorer auditLogs={auditLogs} employees={employees} />);

    fireEvent.change(screen.getByLabelText("수행자"), { target: { value: "박인사" } });
    expect(screen.getByText("1건")).toBeVisible();
    expect(screen.queryByText("PAYROLL_VIEWED")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("수행자"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("작업"), { target: { value: "PAYROLL" } });
    expect(screen.getByText("본인 급여명세서 열람")).toBeVisible();

    fireEvent.change(screen.getByLabelText("작업"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("대상"), { target: { value: "지각 보정" } });
    expect(screen.getByText("인정 지각 보정")).toBeVisible();
  });

  it("shows a structured empty state and resets active filters", () => {
    render(<AuditLogExplorer auditLogs={auditLogs} employees={employees} />);

    fireEvent.change(screen.getByLabelText("대상"), { target: { value: "없음" } });
    expect(screen.getByRole("heading", { name: "조건에 맞는 기록이 없습니다" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));

    expect(screen.getByText("2건")).toBeVisible();
    expect(screen.getByText("PAYROLL_VIEWED")).toBeVisible();
  });
});
