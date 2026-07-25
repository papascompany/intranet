import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, LoaderCircle, Send, Smartphone, Trash2 } from "lucide-react";

import {
  getPushConfiguration,
  registerPushDevice,
  sendPushTest,
  unregisterPushDevice,
  updatePushDevice
} from "../api/pushHttpClient";
import type { PushAlertPreferences, PushConfiguration } from "../api/pushTypes";
import { InlineNotice, OperationalDialog } from "./operational";
import "./pushNotificationSettings.css";

type PushNotificationSettingsProps = {
  onClose: () => void;
  open: boolean;
};

const defaultPreferences: PushAlertPreferences = { clockIn: true, clockOut: true };

export function PushNotificationSettings({ onClose, open }: PushNotificationSettingsProps) {
  const [configuration, setConfiguration] = useState<PushConfiguration | null>(null);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [isLoading, setIsLoading] = useState(false);
  const [action, setAction] = useState<"register" | "save" | "test" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [browserSubscription, setBrowserSubscription] = useState<PushSubscription | null>(null);

  const capability = useMemo(() => getPushCapability(), []);
  const currentDevice = configuration?.devices.find((device) => device.id === configuration.currentDeviceId);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setIsLoading(true);
    setError(null);
    setMessage(null);
    void loadPushState()
      .then(({ configuration: nextConfiguration, subscription }) => {
        if (!active) return;
        setConfiguration(nextConfiguration);
        setBrowserSubscription(subscription);
        const device = nextConfiguration.devices.find((item) => item.id === nextConfiguration.currentDeviceId);
        setPreferences(device?.preferences ?? defaultPreferences);
      })
      .catch((loadError) => {
        if (active) setError(toErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  async function registerCurrentIPhone() {
    if (!configuration?.publicKey) {
      setError("서버 알림 키가 아직 설정되지 않았습니다.");
      return;
    }
    setAction("register");
    setError(null);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("iPhone 알림 권한이 허용되지 않았습니다.");
      }
      const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      const readyRegistration = await navigator.serviceWorker.ready;
      const subscription = await readyRegistration.pushManager.getSubscription()
        ?? await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(configuration.publicKey)
        });
      const keys = subscription.toJSON().keys;
      if (!keys?.auth || !keys.p256dh) {
        throw new Error("iPhone 알림 암호화 키를 생성하지 못했습니다.");
      }
      const nextConfiguration = await registerPushDevice({
        deviceLabel: capability.isIos ? "iPhone" : "모바일 브라우저",
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: { auth: keys.auth, p256dh: keys.p256dh },
        preferences
      });
      setBrowserSubscription(subscription);
      setConfiguration(nextConfiguration);
      setMessage("이 iPhone에 출퇴근 알림을 등록했습니다.");
      void registration.update();
    } catch (registerError) {
      setError(toErrorMessage(registerError));
    } finally {
      setAction(null);
    }
  }

  async function savePreferences() {
    if (!currentDevice) return;
    setAction("save");
    setError(null);
    setMessage(null);
    try {
      const result = await updatePushDevice(currentDevice.id, preferences);
      setConfiguration((current) => current ? {
        ...current,
        devices: current.devices.map((device) => device.id === result.device.id ? result.device : device)
      } : current);
      setMessage("알림 종류를 저장했습니다.");
    } catch (saveError) {
      setError(toErrorMessage(saveError));
    } finally {
      setAction(null);
    }
  }

  async function testCurrentDevice() {
    if (!currentDevice) return;
    setAction("test");
    setError(null);
    setMessage(null);
    try {
      await sendPushTest(currentDevice.id);
      setMessage("테스트 알림을 전송했습니다.");
    } catch (testError) {
      setError(toErrorMessage(testError));
    } finally {
      setAction(null);
    }
  }

  async function removeCurrentDevice() {
    if (!currentDevice) return;
    setAction("remove");
    setError(null);
    setMessage(null);
    try {
      await unregisterPushDevice(currentDevice.id);
      await browserSubscription?.unsubscribe();
      setBrowserSubscription(null);
      setConfiguration((current) => current ? {
        ...current,
        currentDeviceId: undefined,
        devices: current.devices.filter((device) => device.id !== currentDevice.id)
      } : current);
      setMessage("이 iPhone의 알림을 해제했습니다.");
    } catch (removeError) {
      setError(toErrorMessage(removeError));
    } finally {
      setAction(null);
    }
  }

  return (
    <OperationalDialog
      busy={Boolean(action)}
      className="push-settings-dialog"
      description="관리자 계정에 등록된 iPhone으로 출퇴근 알림을 전송합니다."
      onClose={onClose}
      open={open}
      title="iPhone 알림 설정"
    >
      <div className="operational-dialog__body push-settings">
        {isLoading ? (
          <div className="push-settings__loading" role="status"><LoaderCircle className="is-spinning" />알림 상태 확인 중</div>
        ) : null}

        {!isLoading && (!capability.supported || (capability.isIos && !capability.isStandalone)) ? (
          <div className="push-settings__setup">
            <Smartphone aria-hidden="true" />
            <div>
              <strong>홈 화면에서 인트라넷을 실행해 주세요.</strong>
              <p>Safari 공유 메뉴에서 홈 화면에 추가한 뒤, 생성된 더스토리지 아이콘으로 다시 실행합니다.</p>
            </div>
          </div>
        ) : null}

        {!isLoading && capability.supported && (!capability.isIos || capability.isStandalone) && !currentDevice ? (
          <div className="push-settings__setup is-ready">
            <BellRing aria-hidden="true" />
            <div>
              <strong>이 iPhone은 아직 등록되지 않았습니다.</strong>
              <p>한 번 등록하면 인트라넷이 닫혀 있어도 출퇴근 알림을 받을 수 있습니다.</p>
              <button className="is-primary" disabled={Boolean(action) || !configuration?.configured} onClick={registerCurrentIPhone} type="button">
                {action === "register" ? <LoaderCircle className="is-spinning" /> : <BellRing />}
                이 iPhone에서 알림 받기
              </button>
            </div>
          </div>
        ) : null}

        {currentDevice ? (
          <>
            <div className="push-settings__device-status">
              <span className="push-settings__device-icon"><Smartphone aria-hidden="true" /></span>
              <div><strong>{currentDevice.deviceLabel}</strong><span><Check aria-hidden="true" /> 알림 수신 중</span></div>
            </div>
            <fieldset className="push-settings__preferences">
              <legend>받을 알림</legend>
              <label><input checked={preferences.clockIn} onChange={(event) => setPreferences((current) => ({ ...current, clockIn: event.target.checked }))} type="checkbox" />출근 처리</label>
              <label><input checked={preferences.clockOut} onChange={(event) => setPreferences((current) => ({ ...current, clockOut: event.target.checked }))} type="checkbox" />퇴근 처리</label>
            </fieldset>
            <div className="push-settings__actions">
              <button disabled={Boolean(action)} onClick={savePreferences} type="button">
                {action === "save" ? <LoaderCircle className="is-spinning" /> : <Check />}
                설정 저장
              </button>
              <button disabled={Boolean(action)} onClick={testCurrentDevice} type="button">
                {action === "test" ? <LoaderCircle className="is-spinning" /> : <Send />}
                테스트 알림
              </button>
              <button className="is-danger" disabled={Boolean(action)} onClick={removeCurrentDevice} type="button">
                {action === "remove" ? <LoaderCircle className="is-spinning" /> : <Trash2 />}
                기기 해제
              </button>
            </div>
          </>
        ) : null}

        {configuration?.devices.length && !currentDevice ? (
          <div className="push-settings__other-devices">
            <strong>등록된 다른 기기</strong>
            {configuration.devices.map((device) => <span key={device.id}><Smartphone />{device.deviceLabel}</span>)}
          </div>
        ) : null}

        {message ? <InlineNotice title="완료" tone="success">{message}</InlineNotice> : null}
        {error ? <InlineNotice title="확인 필요" tone="danger">{error}</InlineNotice> : null}
        {!configuration?.configured && !isLoading ? <InlineNotice title="서버 설정 필요" tone="warning">푸시 알림 서버 키가 준비되지 않았습니다.</InlineNotice> : null}
        {capability.permissionDenied ? <InlineNotice title="iPhone 알림이 꺼져 있습니다" tone="warning">iPhone 설정에서 더스토리지 알림을 허용해 주세요.</InlineNotice> : null}
      </div>
    </OperationalDialog>
  );
}

async function loadPushState() {
  let subscription: PushSubscription | null = null;
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    subscription = "PushManager" in window && registration?.pushManager
      ? await registration.pushManager.getSubscription()
      : null;
  }
  const configuration = await getPushConfiguration(subscription?.endpoint);
  return { configuration, subscription };
}

function getPushCapability() {
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return {
    isIos,
    isStandalone,
    permissionDenied: "Notification" in window && Notification.permission === "denied",
    supported: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  };
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "알림 설정을 처리하지 못했습니다.";
}
