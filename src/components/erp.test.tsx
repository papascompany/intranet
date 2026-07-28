import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErpNavItem, ErpShell, StatusPill } from "./erp";

describe("ErpShell", () => {
  afterEach(cleanup);

  it("renders a collapsible mobile menu and closes it after navigation", () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <ErpShell
        mobileNavLabel="나의 하루"
        sidebar={<ErpNavItem active onClick={onNavigate}>나의 하루</ErpNavItem>}
      >
        <p>직원 홈</p>
      </ErpShell>
    );

    const mobileMenu = container.querySelector(".erp-shell__mobile-nav");
    expect(mobileMenu).toHaveTextContent("나의 하루");
    mobileMenu?.setAttribute("open", "");

    fireEvent.click(screen.getAllByRole("button", { name: "나의 하루" })[1]);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(mobileMenu).not.toHaveAttribute("open");
  });
});

describe("StatusPill", () => {
  afterEach(cleanup);

  it("uses the readable detail treatment for long status descriptions", () => {
    render(<StatusPill tone="warning" variant="detail">2026-07-21 · 지각 342분 · 검토 필요</StatusPill>);

    expect(screen.getByText("2026-07-21 · 지각 342분 · 검토 필요").closest(".erp-status-pill"))
      .toHaveClass("is-warning", "is-detail");
  });
});
