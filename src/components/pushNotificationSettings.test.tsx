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
    vi.mocked(getPushConfiguration).mockResolvedValue({ configured: true, devices: [], publicKey: "public-key" });
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

  it("shows the registered current iPhone and its preferences", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    });
    vi.mocked(getPushConfiguration).mockResolvedValue({
      configured: true,
      currentDeviceId: "3",
      publicKey: "public-key",
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
    expect((screen.getByLabelText("출근 처리") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("퇴근 처리") as HTMLInputElement).checked).toBe(true);
  });
});
