import { MapPinned, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { Workplace } from "../domain/types";
import { InlineNotice } from "./operational";
import "./workplaceManager.css";

type WorkplaceDraft = Omit<Workplace, "id">;

export interface WorkplaceManagerProps {
  busy?: boolean;
  workplaces: readonly Workplace[];
  onCreate: (workplace: WorkplaceDraft) => void | Promise<void>;
  onUpdate: (workplaceId: string, patch: Partial<WorkplaceDraft>) => void | Promise<void>;
  onDelete: (workplaceId: string) => void | Promise<void>;
}

const emptyDraft: WorkplaceDraft = {
  name: "",
  latitude: 37.64907,
  longitude: 126.901901,
  allowedRadiusMeters: 300,
  qrPath: "/qr/new-workplace"
};

export function WorkplaceManager({ busy = false, workplaces, onCreate, onUpdate, onDelete }: WorkplaceManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(workplaces[0]?.id ?? null);
  const [draft, setDraft] = useState<WorkplaceDraft>(() => workplaces[0] ? withoutId(workplaces[0]) : emptyDraft);
  const [isCreating, setIsCreating] = useState(workplaces.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isCreating) return;
    const selected = workplaces.find((workplace) => workplace.id === selectedId) ?? workplaces[0];
    if (!selected) {
      setIsCreating(true);
      setSelectedId(null);
      setDraft(emptyDraft);
      return;
    }
    setSelectedId(selected.id);
    setDraft(withoutId(selected));
  }, [isCreating, selectedId, workplaces]);

  const select = (workplace: Workplace) => {
    setError(null);
    setIsCreating(false);
    setSelectedId(workplace.id);
    setDraft(withoutId(workplace));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      if (isCreating) {
        await onCreate(draft);
        setIsCreating(false);
      } else if (selectedId) {
        await onUpdate(selectedId, draft);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "근무지를 저장하지 못했습니다.");
    }
  };

  const remove = async () => {
    if (!selectedId || !window.confirm("선택한 근무지를 삭제할까요? 직원이 배정되어 있으면 삭제할 수 없습니다.")) return;
    setError(null);
    try {
      await onDelete(selectedId);
      setIsCreating(false);
      setSelectedId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "근무지를 삭제하지 못했습니다.");
    }
  };

  return (
    <section aria-labelledby="workplace-manager-title" className="workplace-manager">
      <header className="workplace-manager__header">
        <div>
          <p className="workplace-manager__eyebrow"><MapPinned aria-hidden="true" /> 출퇴근 기준</p>
          <h2 id="workplace-manager-title">근무지 관리</h2>
          <p>직원카드에 배정할 사업장 좌표와 QR 경로를 관리합니다. GPS 허용 반경은 운영 정책이 우선 적용됩니다.</p>
        </div>
        <button className="workplace-manager__new" disabled={busy} onClick={() => { setError(null); setIsCreating(true); setSelectedId(null); setDraft(emptyDraft); }} type="button">
          <Plus aria-hidden="true" size={15} /> 새 근무지
        </button>
      </header>

      {error ? <InlineNotice title="근무지 처리 오류" tone="danger">{error}</InlineNotice> : null}

      <div className="workplace-manager__body">
        <div aria-label="근무지 목록" className="workplace-manager__list" role="list">
          {workplaces.map((workplace) => (
            <button className={selectedId === workplace.id && !isCreating ? "is-selected" : undefined} key={workplace.id} onClick={() => select(workplace)} type="button">
              <strong>{workplace.name}</strong>
              <small>{workplace.latitude.toFixed(6)}, {workplace.longitude.toFixed(6)}</small>
            </button>
          ))}
          {workplaces.length === 0 ? <p className="workplace-manager__empty">등록된 근무지가 없습니다.</p> : null}
        </div>

        <form className="workplace-manager__form" onSubmit={submit}>
          <div className="workplace-manager__form-title"><strong>{isCreating ? "새 근무지 등록" : "근무지 상세"}</strong><span>{isCreating ? "직원 배정 전에 좌표를 확인하세요." : "변경 사항은 감사 로그에 기록됩니다."}</span></div>
          <label><span>근무지 이름</span><input maxLength={80} required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className="workplace-manager__grid">
            <label><span>위도</span><input inputMode="decimal" max="90" min="-90" required step="0.000001" type="number" value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: Number(event.target.value) })} /></label>
            <label><span>경도</span><input inputMode="decimal" max="180" min="-180" required step="0.000001" type="number" value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: Number(event.target.value) })} /></label>
          </div>
          <div className="workplace-manager__grid">
            <label><span>기본 허용 반경</span><span className="workplace-manager__unit-input"><input inputMode="numeric" max="5000" min="50" required step="1" type="number" value={draft.allowedRadiusMeters} onChange={(event) => setDraft({ ...draft, allowedRadiusMeters: Number(event.target.value) })} /><em>m</em></span></label>
            <label><span>QR 경로</span><input required value={draft.qrPath} onChange={(event) => setDraft({ ...draft, qrPath: event.target.value })} /></label>
          </div>
          <div className="workplace-manager__actions">
            {!isCreating ? <button className="workplace-manager__delete" disabled={busy} onClick={() => void remove()} type="button"><Trash2 aria-hidden="true" size={15} /> 삭제</button> : null}
            <button className="workplace-manager__save" disabled={busy} type="submit"><Save aria-hidden="true" size={15} /> {busy ? "저장 중" : isCreating ? "근무지 등록" : "변경 저장"}</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function withoutId(workplace: Workplace): WorkplaceDraft {
  const { id: _id, ...draft } = workplace;
  return draft;
}
