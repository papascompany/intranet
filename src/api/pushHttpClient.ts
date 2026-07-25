import type { PushAlertPreferences, PushConfiguration, PushSubscriptionInput } from "./pushTypes";

type PushError = { error?: string };

export async function getPushConfiguration(currentEndpoint?: string) {
  return await pushPost<PushConfiguration>({ action: "status", currentEndpoint });
}

export async function registerPushDevice(subscription: PushSubscriptionInput) {
  return await pushPost<PushConfiguration>({ action: "subscribe", subscription });
}

export async function updatePushDevice(deviceId: string, preferences: PushAlertPreferences) {
  return await pushPost<{ device: PushConfiguration["devices"][number] }>({ action: "update", deviceId, preferences });
}

export async function unregisterPushDevice(deviceId: string) {
  return await pushPost<{ ok: true }>({ action: "unsubscribe", deviceId });
}

export async function sendPushTest(deviceId: string) {
  return await pushPost<{ ok: true }>({ action: "test", deviceId });
}

async function pushPost<T>(payload: unknown) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) {
      throw new Error(isPushError(body) && body.error ? body.error : "푸시 알림 요청을 처리하지 못했습니다.");
    }
    return body as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("알림 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function isPushError(value: unknown): value is PushError {
  return typeof value === "object" && value !== null && "error" in value;
}
