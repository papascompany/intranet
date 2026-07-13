import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalQueue } from "./approvalQueue";

const employees = [{ id: "emp-1", name: "김운영", department: "운영팀" as const }];
const leaveRequests = [{
  id: "leave-1", employeeId: "emp-1", type: "ANNUAL" as const, startsOn: "2026-07-20", endsOn: "2026-07-21", days: 2, reason: "가족 일정", status: "PENDING" as const
}];
const overtimeRequests = [{
  id: "ot-1", employeeId: "emp-1", date: "2026-07-18", startsAt: "2026-07-18T18:00:00+09:00", endsAt: "2026-07-18T20:30:00+09:00", minutes: 150, reason: "월말 정산", status: "PENDING" as const, payApproved: false
}];

function renderQueue(overrides: Partial<React.ComponentProps<typeof ApprovalQueue>> = {}) {
  return render(<ApprovalQueue employees={employees} leaveRequests={leaveRequests} onApprove={vi.fn()} onReject={vi.fn()} overtimeRequests={overtimeRequests} {...overrides} />);
}

describe("ApprovalQueue", () => {
  afterEach(cleanup);

  it("shows pending leave and overtime rows, then reveals the selected request details", () => {
    renderQueue();

    expect(screen.getByRole("button", { name: /휴가 신청.*김운영.*2026-07-20/u })).toBeVisible();
    expect(screen.getByRole("button", { name: /야근 신청.*김운영.*2026-07-18/u })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /야근 신청.*김운영.*2026-07-18/u }));

    expect(screen.getByText("월말 정산")).toBeVisible();
    expect(screen.getByText("2시간 30분")).toBeVisible();
    expect(screen.getByRole("button", { name: "승인" })).toBeEnabled();
  });

  it("approves the selected item only after confirmation", () => {
    const onApprove = vi.fn();
    renderQueue({ onApprove });

    fireEvent.click(screen.getByRole("button", { name: /휴가 신청.*김운영.*2026-07-20/u }));
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "승인하기" }));

    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ kind: "leave", request: expect.objectContaining({ id: "leave-1" }) }));
  });

  it("requires a rejection reason and surfaces callback failures", async () => {
    const onReject = vi.fn().mockRejectedValue(new Error("승인 권한이 없습니다."));
    renderQueue({ onReject });

    fireEvent.click(screen.getByRole("button", { name: /휴가 신청.*김운영.*2026-07-20/u }));
    fireEvent.click(screen.getByRole("button", { name: "반려" }));
    expect(screen.getByRole("button", { name: "반려하기" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("반려 사유"), { target: { value: "대체 인력 확인이 필요합니다." } });
    fireEvent.click(screen.getByRole("button", { name: "반려하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("승인 권한이 없습니다.");
    expect(onReject).toHaveBeenCalledWith(expect.objectContaining({ kind: "leave" }), "대체 인력 확인이 필요합니다.");
  });
});
