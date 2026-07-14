import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmployeeAccountManager } from "./employeeAccountManager";

const employees = [{ id: "emp-1", name: "김운영", employeeNumber: "P-001", role: "EMPLOYEE" as const, department: "운영팀" as const, hireDate: "2026-07-01", workplaceId: "hq" }];
const workplaces = [{ id: "hq", name: "본사" }];

function renderManager(overrides: Partial<React.ComponentProps<typeof EmployeeAccountManager>> = {}) {
  return render(<EmployeeAccountManager accountStates={[{ employeeId: "emp-1", loginId: "kim-ops", enabled: true }]} employees={employees} onCreate={vi.fn().mockResolvedValue({ temporaryPassword: "Temp-2026!" })} onResetPassword={vi.fn().mockResolvedValue(undefined)} onSetEnabled={vi.fn()} workplaces={workplaces} {...overrides} />);
}

describe("EmployeeAccountManager", () => {
  afterEach(cleanup);

  it("submits required onboarding fields and displays the server-issued temporary password", async () => {
    const onCreate = vi.fn().mockResolvedValue({ temporaryPassword: "Welcome-2026!" });
    renderManager({ onCreate });
    fireEvent.click(screen.getByRole("button", { name: "직원 계정 발급" }));
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "이제작" } });
    fireEvent.change(screen.getByLabelText("로그인 아이디"), { target: { value: "lee-production" } });
    fireEvent.change(screen.getByLabelText("사번"), { target: { value: "P-002" } });
    fireEvent.change(screen.getByLabelText("권한"), { target: { value: "APPROVER" } });
    fireEvent.change(screen.getByLabelText("부서"), { target: { value: "제작팀" } });
    fireEvent.change(screen.getByLabelText("입사일"), { target: { value: "2026-07-14" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "직원 계정 발급" })).getByRole("button", { name: "계정 발급" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: "이제작", loginId: "lee-production", employeeNumber: "P-002", role: "APPROVER", department: "제작팀", hireDate: "2026-07-14", workplaceId: "hq" }));
    expect(await screen.findByText("Welcome-2026!")).toBeVisible();
  });

  it("requires a confirmed 12-character temporary password before resetting the selected employee account", async () => {
    const onResetPassword = vi.fn().mockResolvedValue({ temporaryPassword: "Reset-2026!" });
    const onSetEnabled = vi.fn();
    renderManager({ onResetPassword, onSetEnabled });
    fireEvent.click(screen.getByRole("button", { name: "김운영 비밀번호 재설정" }));
    const dialog = screen.getByRole("dialog", { name: "임시 비밀번호 설정" });
    const submit = within(dialog).getByRole("button", { name: "비밀번호 재설정" });

    fireEvent.change(within(dialog).getByLabelText("임시 비밀번호"), { target: { value: "short" } });
    fireEvent.change(within(dialog).getByLabelText("임시 비밀번호 확인"), { target: { value: "short" } });
    expect(screen.getByText("임시 비밀번호는 12자 이상이어야 합니다.")).toBeVisible();
    expect(submit).toBeDisabled();
    expect(onResetPassword).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("임시 비밀번호"), { target: { value: "Manual-Reset-2026!" } });
    fireEvent.change(within(dialog).getByLabelText("임시 비밀번호 확인"), { target: { value: "different-password" } });
    expect(screen.getByText("임시 비밀번호가 일치하지 않습니다.")).toBeVisible();
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("임시 비밀번호 확인"), { target: { value: "Manual-Reset-2026!" } });
    fireEvent.click(submit);
    await waitFor(() => expect(onResetPassword).toHaveBeenCalledWith("emp-1", "Manual-Reset-2026!"));
    expect(screen.queryByText("Reset-2026!")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "김운영 계정 사용 중지" }));
    expect(onSetEnabled).toHaveBeenCalledWith("emp-1", false);
  });
});
