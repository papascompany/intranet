import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { defaultSystemPolicy, type LeaveCalendarEntry } from "../api/types";
import { LeaveCalendar } from "./leaveCalendar";

const entries: LeaveCalendarEntry[] = [
  {
    id: "leave-approved",
    employeeId: "emp-1",
    employeeName: "이혜진",
    department: "운영팀",
    type: "ANNUAL",
    startsOn: "2026-08-10",
    endsOn: "2026-08-10",
    status: "APPROVED",
    isOwn: false
  },
  {
    id: "leave-pending",
    employeeId: "emp-2",
    employeeName: "김현수",
    department: "제작팀",
    type: "HALF_DAY",
    startsOn: "2026-08-11",
    endsOn: "2026-08-11",
    halfDayPeriod: "PM",
    status: "PENDING",
    isOwn: true
  }
];

describe("LeaveCalendar", () => {
  afterEach(cleanup);

  it("shows employee names, leave types, and pending status in the current month", () => {
    render(<LeaveCalendar asOf="2026-08-07T10:00:00+09:00" entries={entries} mode="employee" policy={defaultSystemPolicy} />);

    expect(screen.getByText("2026년 8월")).toBeVisible();
    expect(screen.getAllByText("이혜진").length).toBeGreaterThan(0);
    expect(screen.getAllByText("김현수").length).toBeGreaterThan(0);
    expect(screen.getAllByText("오후 반차 · 대기").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("월간 휴가 요약")).toHaveTextContent("2명 휴가");
  });

  it("moves between months and returns to the current month", () => {
    render(<LeaveCalendar asOf="2026-08-07T10:00:00+09:00" entries={entries} mode="admin" policy={defaultSystemPolicy} />);

    fireEvent.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByText("2026년 9월")).toBeVisible();
    expect(screen.getByText("이달에 예정된 휴가가 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(screen.getByText("2026년 8월")).toBeVisible();
  });
});
