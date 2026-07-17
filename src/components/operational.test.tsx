import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, FormDialog, InlineNotice } from "./operational";

afterEach(cleanup);

describe("operational UI primitives", () => {
  it("announces an actionable error notice", () => {
    render(<InlineNotice tone="danger" title="저장 실패">다시 시도해 주세요.</InlineNotice>);

    expect(screen.getByRole("alert")).toHaveTextContent("저장 실패");
    expect(screen.getByRole("alert")).toHaveTextContent("다시 시도해 주세요.");
  });

  it("submits a form dialog and disables duplicate actions while busy", () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
    const onClose = vi.fn();
    const { rerender } = render(
      <FormDialog onClose={onClose} onSubmit={onSubmit} open title="휴가 신청">
        <label htmlFor="reason">사유</label>
        <input id="reason" required />
      </FormDialog>
    );

    fireEvent.change(screen.getByLabelText("사유"), { target: { value: "개인 사유" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(
      <FormDialog busy onClose={onClose} onSubmit={onSubmit} open title="휴가 신청">
        <label htmlFor="reason">사유</label>
        <input id="reason" />
      </FormDialog>
    );

    expect(screen.getByRole("button", { name: "처리 중..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("requires an explicit confirm click for destructive actions", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        confirmLabel="삭제"
        confirmTone="danger"
        description="삭제된 명세서는 복구할 수 없습니다."
        onClose={onClose}
        onConfirm={onConfirm}
        open
        title="급여명세서를 삭제할까요?"
      />
    );

    expect(screen.getByRole("dialog", { name: "급여명세서를 삭제할까요?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks the dialog close control while an action is in progress", () => {
    render(
      <FormDialog busy onClose={vi.fn()} onSubmit={vi.fn()} open title="직원카드 저장">
        <p>저장 중</p>
      </FormDialog>
    );

    expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
  });
});
