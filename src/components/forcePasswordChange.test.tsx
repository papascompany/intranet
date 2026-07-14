import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForcePasswordChange } from "./forcePasswordChange";

function renderComponent(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  return { onSubmit, ...render(<ForcePasswordChange onSubmit={onSubmit} />) };
}

function enterPassword(password: string, confirmation = password) {
  fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: confirmation } });
}

describe("ForcePasswordChange", () => {
  afterEach(cleanup);

  it("blocks submission until the password meets every requirement and matches its confirmation", () => {
    const { onSubmit } = renderComponent();
    enterPassword("short", "different");

    fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("요구 사항을 모두 충족");
    expect(screen.getByLabelText("새 비밀번호")).toHaveAttribute("aria-invalid", "true");

    enterPassword("ValidPassword1!", "ValidPassword2!");
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("일치하지 않습니다");
    expect(screen.getByLabelText("새 비밀번호 확인")).toHaveAttribute("aria-invalid", "true");
  });

  it("submits a valid password and prevents repeat submission while pending", async () => {
    let resolveSubmission: (() => void) | undefined;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { resolveSubmission = resolve; }));
    renderComponent(onSubmit);
    enterPassword("ValidPassword1!");

    fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }));

    expect(onSubmit).toHaveBeenCalledWith("ValidPassword1!");
    expect(screen.getByRole("button", { name: "변경 중..." })).toBeDisabled();
    expect(screen.getByLabelText("새 비밀번호")).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "변경 중..." }).closest("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    resolveSubmission?.();
    await waitFor(() => expect(screen.getByRole("button", { name: "비밀번호 변경" })).toBeEnabled());
  });

  it("shows a callback failure and allows the user to retry", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("비밀번호를 저장할 수 없습니다."));
    renderComponent(onSubmit);
    enterPassword("ValidPassword1!");

    fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("비밀번호를 저장할 수 없습니다.");
    expect(screen.getByRole("button", { name: "비밀번호 변경" })).toBeEnabled();
  });
});
