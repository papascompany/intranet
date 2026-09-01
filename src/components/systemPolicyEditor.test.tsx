import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSystemPolicy } from "../api/types";
import { SystemPolicyEditor } from "./systemPolicyEditor";

function renderEditor(overrides: Partial<React.ComponentProps<typeof SystemPolicyEditor>> = {}) {
  return render(<SystemPolicyEditor onSave={vi.fn()} settings={defaultSystemPolicy} {...overrides} />);
}

describe("SystemPolicyEditor", () => {
  afterEach(cleanup);

  it("renders the fixed operating policy without an editable GPS gate", () => {
    renderEditor();

    expect(screen.queryByLabelText("허용 반경")).not.toBeInTheDocument();
    expect(screen.getByText("직원 버튼 클릭으로 즉시 처리하고 서버 시각을 기록")).toBeVisible();
    expect(screen.getByText("직원카드 배정과 관리 참고용으로 보관하며 승인에는 사용하지 않음")).toBeVisible();
    expect(screen.getByText("직원은 열람만 가능, 관리자는 소프트 삭제만 가능")).toBeVisible();
    expect(screen.getByText("관리자로 지정된 계정만 승인 가능")).toBeVisible();
    expect(screen.getByText("휴직·장기결근은 HR 보정으로 처리")).toBeVisible();
  });

  it("exposes new work schedule and leave controls with accessible names and selected states", () => {
    renderEditor();

    expect(screen.getByLabelText("타임존")).toBeDisabled();
    expect(screen.getByLabelText("출근 시각")).toHaveValue("08:00");
    expect(screen.getByLabelText("휴게 종료")).toHaveValue("13:00");
    expect(screen.getByRole("group", { name: "근무요일" })).toBeVisible();
    expect(screen.getByRole("button", { name: "월" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "토" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("연차 사용 단위")).toHaveValue("0.5");
    expect(screen.getByLabelText("연차/월차 자동 생성")).toBeChecked();
    expect(screen.getByLabelText("부분휴가 사용 허용")).toBeChecked();
    expect(screen.getByLabelText("연차 초과 사용 허용")).not.toBeChecked();
    expect(screen.getByLabelText("휴가 신청 사유 필수 입력")).not.toBeChecked();
    expect(screen.getByLabelText("회사 휴일")).toHaveValue("");
  });

  it("saves edited work schedule, leave options, and workdays as one complete policy", () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    fireEvent.change(screen.getByLabelText("출근 시각"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("퇴근 시각"), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText("휴게 시작"), { target: { value: "13:00" } });
    fireEvent.change(screen.getByLabelText("휴게 종료"), { target: { value: "14:00" } });
    fireEvent.click(screen.getByRole("button", { name: "토" }));
    fireEvent.change(screen.getByLabelText("연차 사용 단위"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("연차 초과 사용 허용"));
    fireEvent.click(screen.getByLabelText("부분휴가 사용 허용"));
    fireEvent.click(screen.getByLabelText("휴가 신청 사유 필수 입력"));
    fireEvent.click(screen.getByRole("button", { name: "근무·연차 정책 저장" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      workStartTime: "09:00",
      workEndTime: "18:00",
      breakStartTime: "13:00",
      breakEndTime: "14:00",
      workDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
      annualLeaveUnit: 1,
      annualLeaveOveruseAllowed: true,
      partialLeaveAllowed: false,
      leaveReasonRequired: true
    }));
  });

  it("saves additional payroll holidays as normalized dates", () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    fireEvent.change(screen.getByLabelText("회사 휴일"), { target: { value: "2026-09-24, 2026-09-25\n2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "근무·연차 정책 저장" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ payrollHolidayDates: ["2026-09-24", "2026-09-25"] }));
  });

  it("blocks invalid work schedules and announces the correction needed", () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    fireEvent.change(screen.getByLabelText("휴게 종료"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: "근무·연차 정책 저장" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("근무요일을 하나 이상 선택하고, 근무시간 안에 유효한 휴게시간을 입력해 주세요.");
  });

  it("announces a save callback failure", async () => {
    renderEditor({ onSave: vi.fn().mockRejectedValue(new Error("관리자 권한이 없습니다.")) });

    fireEvent.click(screen.getByRole("button", { name: "근무·연차 정책 저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("관리자 권한이 없습니다.");
  });
});
