import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Clock3, MapPin, ShieldCheck } from "lucide-react";
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
const weekdays: Array<{ label: string; value: SystemPolicy["workDays"][number] }> = [
  { label: "월", value: "MON" }, { label: "화", value: "TUE" }, { label: "수", value: "WED" },
  { label: "목", value: "THU" }, { label: "금", value: "FRI" }, { label: "토", value: "SAT" }, { label: "일", value: "SUN" }
];

export function SystemPolicyEditor({ busy = false, error, onSave, settings }: SystemPolicyEditorProps) {
  const [draft, setDraft] = useState<SystemPolicy>(settings);
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const radiusValid = Number.isInteger(draft.gpsAllowedRadiusMeters)
    && draft.gpsAllowedRadiusMeters >= minimumGpsRadius
    && draft.gpsAllowedRadiusMeters <= maximumGpsRadius;
  const scheduleValid = draft.workDays.length > 0
    && draft.workStartTime < draft.workEndTime
    && draft.breakStartTime < draft.breakEndTime
    && draft.breakStartTime >= draft.workStartTime
    && draft.breakEndTime <= draft.workEndTime;
  const formValid = radiusValid && scheduleValid;

  useEffect(() => {
    setDraft(settings);
    setSubmitted(false);
    setSaveError(null);
  }, [settings]);

  const workSummary = useMemo(() => {
    const labels = weekdays.filter((day) => draft.workDays.includes(day.value)).map((day) => day.label).join("·");
    return `${draft.workStartTime}~${draft.workEndTime} · 휴게 ${draft.breakStartTime}~${draft.breakEndTime} · ${labels}`;
  }, [draft]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    if (busy || !formValid) return;
    try {
      await onSave(draft);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "정책을 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  const update = <Key extends keyof SystemPolicy>(key: Key, value: SystemPolicy[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const toggleWorkDay = (day: SystemPolicy["workDays"][number]) => {
    update("workDays", draft.workDays.includes(day) ? draft.workDays.filter((value) => value !== day) : [...draft.workDays, day]);
  };

  return (
    <section aria-labelledby="system-policy-title" className="system-policy-editor">
      <header className="system-policy-editor__header">
        <div>
          <p className="system-policy-editor__eyebrow"><ShieldCheck aria-hidden="true" /> 운영 정책</p>
          <h2 id="system-policy-title">근무제 및 연차 정책</h2>
          <p>전 직원에게 적용되는 기본 근무시간과 연차 생성·사용 기준을 관리합니다.</p>
        </div>
      </header>

      {saveError || error ? <InlineNotice tone="danger" title="정책을 저장하지 못했습니다">{saveError ?? error}</InlineNotice> : null}

      <form className="system-policy-editor__form" noValidate onSubmit={submit}>
        <section aria-labelledby="work-policy-title" className="system-policy-editor__setting">
          <div className="system-policy-editor__setting-heading">
            <Clock3 aria-hidden="true" />
            <div><h3 id="work-policy-title">기본 근무제</h3><p>{workSummary}</p></div>
          </div>
          <div className="system-policy-editor__grid">
            <label><span>타임존</span><select disabled value={draft.timezone}><option value="Asia/Seoul">Asia/Seoul</option></select></label>
            <label><span>출근 시각</span><input onChange={(event) => update("workStartTime", event.target.value)} type="time" value={draft.workStartTime} /></label>
            <label><span>퇴근 시각</span><input onChange={(event) => update("workEndTime", event.target.value)} type="time" value={draft.workEndTime} /></label>
            <label><span>휴게 시작</span><input onChange={(event) => update("breakStartTime", event.target.value)} type="time" value={draft.breakStartTime} /></label>
            <label><span>휴게 종료</span><input onChange={(event) => update("breakEndTime", event.target.value)} type="time" value={draft.breakEndTime} /></label>
          </div>
          <fieldset className="system-policy-editor__days"><legend>근무요일</legend><div>{weekdays.map((day) => <button aria-pressed={draft.workDays.includes(day.value)} className={draft.workDays.includes(day.value) ? "is-active" : undefined} key={day.value} onClick={() => toggleWorkDay(day.value)} type="button">{day.label}</button>)}</div></fieldset>
          {submitted && !scheduleValid ? <p className="system-policy-editor__field-error" role="alert">근무요일을 하나 이상 선택하고, 근무시간 안에 유효한 휴게시간을 입력해 주세요.</p> : null}
        </section>

        <section aria-labelledby="leave-policy-title" className="system-policy-editor__setting">
          <div className="system-policy-editor__setting-heading">
            <CalendarDays aria-hidden="true" />
            <div><h3 id="leave-policy-title">연차 생성 및 사용</h3><p>입사일 기준 자동 생성과 반차 단위 사용을 기본으로 합니다.</p></div>
          </div>
          <div className="system-policy-editor__grid">
            <label><span>연차 사용 단위</span><select onChange={(event) => update("annualLeaveUnit", Number(event.target.value) as 0.5 | 1)} value={draft.annualLeaveUnit}><option value="0.5">반차 (0.5일)</option><option value="1">1일</option></select></label>
          </div>
          <div className="system-policy-editor__toggles">
            <PolicyToggle checked={draft.annualLeaveAutoAccrual} label="연차/월차 자동 생성" onChange={(checked) => update("annualLeaveAutoAccrual", checked)} />
            <PolicyToggle checked={draft.partialLeaveAllowed} label="부분휴가 사용 허용" onChange={(checked) => update("partialLeaveAllowed", checked)} />
            <PolicyToggle checked={draft.annualLeaveOveruseAllowed} label="연차 초과 사용 허용" onChange={(checked) => update("annualLeaveOveruseAllowed", checked)} />
          </div>
        </section>

        <section aria-labelledby="gps-policy-title" className="system-policy-editor__setting">
          <div className="system-policy-editor__setting-heading"><MapPin aria-hidden="true" /><div><h3 id="gps-policy-title">GPS 출퇴근 허용 반경</h3><p>사업장 기준 좌표에서 이 거리 안이면 GPS 출퇴근을 인정합니다.</p></div></div>
          <label className="system-policy-editor__compact-field"><span>허용 반경</span><span className="system-policy-editor__radius-input"><input aria-invalid={submitted && !radiusValid ? "true" : undefined} aria-label="허용 반경" inputMode="numeric" max={maximumGpsRadius} min={minimumGpsRadius} onChange={(event) => update("gpsAllowedRadiusMeters", Number(event.target.value))} type="number" value={draft.gpsAllowedRadiusMeters} /><span>m</span></span></label>
          {submitted && !radiusValid ? <p className="system-policy-editor__field-error" role="alert">GPS 허용 반경은 50m부터 5,000m 사이의 정수로 입력해 주세요.</p> : null}
        </section>

        <section aria-labelledby="fixed-policy-title" className="system-policy-editor__setting">
          <div className="system-policy-editor__setting-heading"><ShieldCheck aria-hidden="true" /><div><h3 id="fixed-policy-title">확정 운영 정책</h3><p>보안과 결재 권한에 관한 고정 기준입니다.</p></div></div>
          <dl className="system-policy-editor__fixed-list">
            <div><dt>GPS 확인 실패</dt><dd>QR 인증과 수동 출퇴근을 동등하게 허용</dd></div>
            <div><dt>급여명세서</dt><dd>직원은 열람만 가능, 관리자는 소프트 삭제만 가능</dd></div>
            <div><dt>야근 수당 인정</dt><dd>관리자로 지정된 계정만 승인 가능</dd></div>
            <div><dt>선사용 휴가 예외</dt><dd>휴직·장기결근은 HR 보정으로 처리</dd></div>
          </dl>
        </section>

        <div className="system-policy-editor__actions"><button disabled={busy} type="submit">{busy ? "저장 중" : "근무·연차 정책 저장"}</button></div>
      </form>
    </section>
  );
}

function PolicyToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="system-policy-editor__toggle"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span aria-hidden="true" /><strong>{label}</strong></label>;
}
