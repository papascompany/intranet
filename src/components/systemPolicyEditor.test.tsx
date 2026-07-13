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

  it("renders the editable GPS setting and every fixed operating policy", () => {
    renderEditor();

    expect(screen.getByLabelText("허용 반경")).toHaveValue(300);
    expect(screen.getByText("QR 인증과 수동 출퇴근을 동등하게 허용")).toBeVisible();
    expect(screen.getByText("직원은 열람만 가능, 관리자는 소프트 삭제만 가능")).toBeVisible();
    expect(screen.getByText("관리자로 지정된 계정만 승인 가능")).toBeVisible();
    expect(screen.getByText("휴직·장기결근은 HR 보정으로 처리")).toBeVisible();
  });

  it("validates the GPS radius before invoking save", () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    fireEvent.change(screen.getByLabelText("허용 반경"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "정책 저장" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("50m부터 5,000m 사이의 정수");
    expect(screen.getByLabelText("허용 반경")).toHaveAttribute("aria-invalid", "true");
  });

  it("saves a complete settings object with the validated GPS radius", () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    fireEvent.change(screen.getByLabelText("허용 반경"), { target: { value: "450" } });
    fireEvent.click(screen.getByRole("button", { name: "정책 저장" }));

    expect(onSave).toHaveBeenCalledWith({ ...defaultSystemPolicy, gpsAllowedRadiusMeters: 450 });
  });

  it("announces a save callback failure", async () => {
    renderEditor({ onSave: vi.fn().mockRejectedValue(new Error("관리자 권한이 없습니다.")) });

    fireEvent.click(screen.getByRole("button", { name: "정책 저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("관리자 권한이 없습니다.");
  });
});
