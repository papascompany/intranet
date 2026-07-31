import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPushConfiguration } from "../api/pushHttpClient";
import { PushNotificationSettings } from "./pushNotificationSettings";

vi.mock("../api/pushHttpClient", () => ({
  getPushConfiguration: vi.fn(),
  registerPushDevice: vi.fn(),
  sendPushTest: vi.fn(),
  unregisterPushDevice: vi.fn(),
  updatePushDevice: vi.fn()
}));

describe("PushNotificationSettings", () => {
  beforeEach(() => {
    vi.mocked(getPushConfiguration).mockResolvedValue({
      configured: true,
      devices: [],
      publicKey: "public-key",
      recipients: [{ employeeId: "admin-1", enabledDeviceCount: 0, name: "더스토리지", role: "HR_ADMIN" }]
    });
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone) AppleWebKit Safari" });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: vi.fn(async () => undefined) }
    });
    Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default" } });
  });

  it("guides iPhone administrators to launch the Home Screen app", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    });

    render(<PushNotificationSettings onClose={vi.fn()} open />);

    expect(await screen.findByText("홈 화면에서 인트라넷을 실행해 주세요.")).toBeTruthy();
    await waitFor(() => expect(getPushConfiguration).toHaveBeenCalled());
  });

  it("shows the registered current iPhone and mandatory attendance alerts", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    });
    vi.mocked(getPushConfiguration).mockResolvedValue({
      configured: true,
      currentDeviceId: "3",
      publicKey: "public-key",
      recipients: [{ employeeId: "admin-1", enabledDeviceCount: 1, name: "더스토리지", role: "HR_ADMIN" }],
      devices: [{
        id: "3",
        deviceLabel: "iPhone",
        enabled: true,
        createdAt: "2026-07-24T00:00:00.000Z",
        preferences: { clockIn: true, clockOut: true }
      }]
    });

    render(<PushNotificationSettings onClose={vi.fn()} open />);

    expect(await screen.findByText("알림 수신 중")).toBeTruthy();
    expect(screen.getByText("필수 수신 항목")).toBeTruthy();
    expect(screen.getByText("출근 처리")).toBeTruthy();
    expect(screen.getByText("퇴근 처리")).toBeTruthy();
    expect(screen.getByText("iPhone 1대")).toBeTruthy();
  });
});
