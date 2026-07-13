import { useEffect, useState, type FormEvent } from "react";
import { MapPin, ShieldCheck } from "lucide-react";
import type { SystemPolicy } from "../api/types";
import { InlineNotice } from "./operational";
import "./systemPolicyEditor.css";

export interface SystemPolicyEditorProps {
  busy?: boolean;
  error?: string | null;
  onSave: (settings: SystemPolicy) => void | Promise<void>;
  settings: SystemPolicy;
}

const minimumGpsRadius = 50;
const maximumGpsRadius = 5_000;

function parseRadius(value: string) {
  const radius = Number(value);
  if (!Number.isInteger(radius) || radius < minimumGpsRadius || radius > maximumGpsRadius) {
    return undefined;
  }
  return radius;
}

export function SystemPolicyEditor({ busy = false, error, onSave, settings }: SystemPolicyEditorProps) {
  const [radius, setRadius] = useState(String(settings.gpsAllowedRadiusMeters));
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const validRadius = parseRadius(radius);
  const radiusError = submitted && validRadius === undefined
    ? `GPS 허용 반경은 ${minimumGpsRadius.toLocaleString("ko-KR")}m부터 ${maximumGpsRadius.toLocaleString("ko-KR")}m 사이의 정수로 입력해 주세요.`
    : null;

  useEffect(() => {
    setRadius(String(settings.gpsAllowedRadiusMeters));
    setSubmitted(false);
    setSaveError(null);
  }, [settings]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    if (busy || validRadius === undefined) return;

    try {
      await onSave({ ...settings, gpsAllowedRadiusMeters: validRadius });
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "정책을 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  const visibleError = saveError ?? error;

  return (
    <section aria-labelledby="system-policy-title" className="system-policy-editor">
      <header className="system-policy-editor__header">
        <div>
          <p className="system-policy-editor__eyebrow"><ShieldCheck aria-hidden="true" /> 운영 정책</p>
          <h2 id="system-policy-title">근태 및 인사 정책</h2>
          <p>현장 근태 기준과 확정된 운영 원칙을 관리합니다.</p>
        </div>
      </header>

      {visibleError ? <InlineNotice tone="danger" title="정책을 저장하지 못했습니다">{visibleError}</InlineNotice> : null}

      <form className="system-policy-editor__form" noValidate onSubmit={submit}>
        <section aria-labelledby="gps-policy-title" className="system-policy-editor__setting">
          <div className="system-policy-editor__setting-heading">
            <MapPin aria-hidden="true" />
            <div>
              <h3 id="gps-policy-title">GPS 출퇴근 허용 반경</h3>
              <p>사업장 기준 좌표에서 이 거리 안이면 GPS 출퇴근을 인정합니다.</p>
            </div>
          </div>
          <div className="system-policy-editor__radius-label">
            <label htmlFor="gps-allowed-radius" id="gps-allowed-radius-label">허용 반경</label>
            <span className="system-policy-editor__radius-input">
              <input
                aria-describedby={radiusError ? "gps-radius-error" : "gps-radius-help"}
                aria-invalid={radiusError ? "true" : undefined}
                aria-labelledby="gps-allowed-radius-label"
                disabled={busy}
                id="gps-allowed-radius"
                inputMode="numeric"
                max={maximumGpsRadius}
                min={minimumGpsRadius}
                onChange={(event) => setRadius(event.target.value)}
                required
                step={1}
                type="number"
                value={radius}
              />
              <span aria-hidden="true">m</span>
            </span>
          </div>
          <p className="system-policy-editor__help" id="gps-radius-help">{minimumGpsRadius.toLocaleString("ko-KR")}m~{maximumGpsRadius.toLocaleString("ko-KR")}m 사이에서 설정할 수 있습니다.</p>
          {radiusError ? <p className="system-policy-editor__field-error" id="gps-radius-error" role="alert">{radiusError}</p> : null}
        </section>

        <section aria-labelledby="fixed-policy-title" className="system-policy-editor__setting">
          <div className="system-policy-editor__setting-heading">
            <ShieldCheck aria-hidden="true" />
            <div>
              <h3 id="fixed-policy-title">확정 운영 정책</h3>
              <p>아래 항목은 현재 운영 기준으로 고정되어 있습니다.</p>
            </div>
          </div>
          <dl className="system-policy-editor__fixed-list">
            <div><dt>GPS 확인 실패</dt><dd>QR 인증과 수동 출퇴근을 동등하게 허용</dd></div>
            <div><dt>급여명세서</dt><dd>직원은 열람만 가능, 관리자는 소프트 삭제만 가능</dd></div>
            <div><dt>야근 수당 인정</dt><dd>관리자로 지정된 계정만 승인 가능</dd></div>
            <div><dt>선사용 휴가 예외</dt><dd>휴직·장기결근은 HR 보정으로 처리</dd></div>
          </dl>
        </section>

        <div className="system-policy-editor__actions">
          <button disabled={busy} type="submit">{busy ? "저장 중" : "정책 저장"}</button>
        </div>
      </form>
    </section>
  );
}
