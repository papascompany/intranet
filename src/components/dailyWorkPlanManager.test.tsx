import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyWorkPlanManager } from "./dailyWorkPlanManager";

const employees = [
  { id: "emp-1", name: "김제작", department: "제작팀" as const },
  { id: "emp-2", name: "이운영", department: "운영팀" as const }
];

const tasks = [{
  id: "task-1",
  employeeId: "emp-1",
  department: "제작팀" as const,
  date: "2026-07-13",
  title: "상세 페이지 시안 검토",
  dueLabel: "15:00까지",
  displayOrder: 1,
  status: "TODO" as const
}];

describe("DailyWorkPlanManager", () => {
  afterEach(cleanup);

  it("creates a task plan with the entered fields", async () => {
    const onCreate = vi.fn();
    render(<DailyWorkPlanManager employees={employees} onCreate={onCreate} onUpdate={vi.fn()} tasks={tasks} />);

    fireEvent.click(screen.getByRole("button", { name: "작업 배정" }));
    fireEvent.change(screen.getByLabelText("작업 제목"), { target: { value: "촬영 목록 확정" } });
    fireEvent.change(screen.getByLabelText("작업일"), { target: { value: "2026-07-14" } });
    fireEvent.change(screen.getByLabelText("담당자"), { target: { value: "emp-2" } });
    fireEvent.change(screen.getByLabelText("마감 표시"), { target: { value: "17:00까지" } });
    fireEvent.change(screen.getByLabelText("정렬 순서"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("진행 상태"), { target: { value: "IN_PROGRESS" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "작업 배정" })).getByRole("button", { name: "작업 배정" }));

    expect(onCreate).toHaveBeenCalledWith({
      employeeId: "emp-2",
      date: "2026-07-14",
      title: "촬영 목록 확정",
      dueLabel: "17:00까지",
      displayOrder: 3,
      status: "IN_PROGRESS"
    });
  });

  it("edits the selected row rather than another task", () => {
    const onUpdate = vi.fn();
    render(<DailyWorkPlanManager employees={employees} onCreate={vi.fn()} onUpdate={onUpdate} tasks={tasks} />);

    fireEvent.click(screen.getByRole("button", { name: "상세 페이지 시안 검토 편집" }));
    expect(screen.getByRole("dialog", { name: "작업계획 편집" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("작업 제목"), { target: { value: "상세 페이지 최종 검토" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));

    expect(onUpdate).toHaveBeenCalledWith("task-1", expect.objectContaining({ title: "상세 페이지 최종 검토" }));
  });

  it("disables plan changes while a parent action is busy", () => {
    render(<DailyWorkPlanManager busy employees={employees} onCreate={vi.fn()} onUpdate={vi.fn()} tasks={tasks} />);

    expect(screen.getByRole("button", { name: "작업 배정" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "상세 페이지 시안 검토 편집" })).toBeDisabled();
  });
});
