import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmployeeAccountManager } from "./employeeAccountManager";

const employees = [{ id: "emp-1", name: "김운영", employeeNumber: "P-001", role: "EMPLOYEE" as const, department: "운영팀" as const, hireDate: "2026-07-01", workplaceId: "hq" }];
const workplaces = [{ id: "hq", name: "본사" }];

function renderManager(overrides: Partial<React.ComponentProps<typeof EmployeeAccountManager>> = {}) {
  return render(<EmployeeAccountManager accountStates={[{ employeeId: "emp-1", enabled: true }]} employees={employees} onCreate={vi.fn().mockResolvedValue({ temporaryPassword: "Temp-2026!" })} onResetPassword={vi.fn().mockResolvedValue({ temporaryPassword: "Reset-2026!" })} onSetEnabled={vi.fn()} workplaces={workplaces} {...overrides} />);
}

describe("EmployeeAccountManager", () => {
  afterEach(cleanup);

  it("submits required onboarding fields and displays the server-issued temporary password", async () => {
    const onCreate = vi.fn().mockResolvedValue({ temporaryPassword: "Welcome-2026!" });
    renderManager({ onCreate });
    fireEvent.click(screen.getByRole("button", { name: "직원 계정 발급" }));
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "이제작" } });
    fireEvent.change(screen.getByLabelText("사번"), { target: { value: "P-002" } });
    fireEvent.change(screen.getByLabelText("권한"), { target: { value: "APPROVER" } });
    fireEvent.change(screen.getByLabelText("부서"), { target: { value: "제작팀" } });
    fireEvent.change(screen.getByLabelText("입사일"), { target: { value: "2026-07-14" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "직원 계정 발급" })).getByRole("button", { name: "계정 발급" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: "이제작", employeeNumber: "P-002", role: "APPROVER", department: "제작팀", hireDate: "2026-07-14", workplaceId: "hq" }));
    expect(await screen.findByText("Welcome-2026!")).toBeVisible();
  });

  it("resets the selected employee password and toggles that employee account", async () => {
    const onResetPassword = vi.fn().mockResolvedValue({ temporaryPassword: "Reset-2026!" });
    const onSetEnabled = vi.fn();
    renderManager({ onResetPassword, onSetEnabled });
    fireEvent.click(screen.getByRole("button", { name: "김운영 비밀번호 재설정" }));
    await waitFor(() => expect(onResetPassword).toHaveBeenCalledWith("emp-1"));
    expect(await screen.findByText("Reset-2026!")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "김운영 계정 사용 중지" }));
    expect(onSetEnabled).toHaveBeenCalledWith("emp-1", false);
  });
});
