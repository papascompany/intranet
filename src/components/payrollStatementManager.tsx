import { useMemo, useState, type FormEvent } from "react";
import { Download, FileText, Trash2 } from "lucide-react";
import type { PayrollStatement } from "../domain/types";
import { FormDialog, InlineNotice } from "./operational";
import "./payrollStatementManager.css";

export type PayrollStatementManagerMode = "employee" | "admin";

export interface PayrollStatementManagerProps {
  busy?: boolean;
  mode: PayrollStatementManagerMode;
  onDelete?: (statement: PayrollStatement, reason: string) => void | Promise<void>;
  onDownload: (statement: PayrollStatement) => void | Promise<void>;
  statements: readonly PayrollStatement[];
}

function monthLabel(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  return match ? `${match[1]}년 ${Number(match[2])}월` : month;
}

function uploadedAtLabel(uploadedAt: string) {
  const date = new Date(uploadedAt);
  if (Number.isNaN(date.getTime())) return uploadedAt;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

export function PayrollStatementManager({
  busy = false,
  mode,
  onDelete,
  onDownload,
  statements
}: PayrollStatementManagerProps) {
  const [selectedForDelete, setSelectedForDelete] = useState<PayrollStatement | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isAdmin = mode === "admin";
  const isBusy = busy || isSubmitting;
  const visibleStatements = useMemo(
    () => [...statements].filter((statement) => !statement.deletedAt).sort((left, right) => right.month.localeCompare(left.month)),
    [statements]
  );

  const closeDeleteDialog = () => {
    if (isBusy) return;
    setSelectedForDelete(null);
    setDeleteReason("");
    setActionError(null);
  };

  const runAction = async (action: () => void | Promise<void>) => {
    setActionError(null);
    setIsSubmitting(true);
    try {
      await action();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setIsSubmitting(false);
    }

    return true;
  };

  const download = (statement: PayrollStatement) => {
    void runAction(() => onDownload(statement));
  };

  const submitDelete = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedForDelete || !onDelete || !deleteReason.trim()) return;

    void runAction(() => onDelete(selectedForDelete, deleteReason.trim())).then((completed) => {
      if (completed) closeDeleteDialog();
    });
  };

  return (
    <section aria-labelledby="payroll-statement-manager-title" className="payroll-statement-manager">
      <header className="payroll-statement-manager__header">
        <div>
          <p className="payroll-statement-manager__eyebrow"><FileText aria-hidden="true" /> 급여</p>
          <h2 id="payroll-statement-manager-title">급여명세서</h2>
          <p>{isAdmin ? "선택한 직원의 급여명세서를 관리합니다." : "내 급여명세서를 열람하고 내려받을 수 있습니다."}</p>
        </div>
        <span aria-label={`급여명세서 ${visibleStatements.length}건`} className="payroll-statement-manager__count">{visibleStatements.length}건</span>
      </header>

      {actionError && !selectedForDelete ? <InlineNotice title="처리하지 못했습니다" tone="danger">{actionError}</InlineNotice> : null}

      {visibleStatements.length ? (
        <div aria-label="급여명세서 목록" className="payroll-statement-manager__list" role="list">
          {visibleStatements.map((statement) => (
            <article className="payroll-statement-row" key={statement.id} role="listitem">
              <div className="payroll-statement-row__month">{monthLabel(statement.month)}</div>
              <div className="payroll-statement-row__file">
                <FileText aria-hidden="true" />
                <div>
                  <strong>{statement.filename}</strong>
                  <span>등록일 {uploadedAtLabel(statement.uploadedAt)}</span>
                </div>
              </div>
              <div className="payroll-statement-row__actions">
                <button aria-label={`${monthLabel(statement.month)} 명세서 다운로드`} disabled={isBusy} onClick={() => download(statement)} type="button">
                  <Download aria-hidden="true" />
                  <span>다운로드</span>
                </button>
                {isAdmin && onDelete ? (
                  <button
                    aria-label={`${monthLabel(statement.month)} 명세서 삭제`}
                    className="payroll-statement-row__delete"
                    disabled={isBusy}
                    onClick={() => {
                      setActionError(null);
                      setDeleteReason("");
                      setSelectedForDelete(statement);
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                    <span>삭제</span>
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="payroll-statement-manager__empty">표시할 급여명세서가 없습니다.</div>}

      <FormDialog
        busy={isBusy}
        description="삭제한 명세서는 직원 목록에서 즉시 숨겨집니다. 삭제 사유는 감사 기록에 남습니다."
        error={actionError ?? undefined}
        onClose={closeDeleteDialog}
        onSubmit={submitDelete}
        open={selectedForDelete !== null}
        submitDisabled={!deleteReason.trim()}
        submitLabel="삭제하기"
        title="급여명세서를 삭제할까요?"
      >
        {selectedForDelete ? (
          <div className="payroll-statement-manager__delete-form">
            <strong>{monthLabel(selectedForDelete.month)} · {selectedForDelete.filename}</strong>
            <label htmlFor="payroll-statement-delete-reason">
              삭제 사유
              <textarea
                id="payroll-statement-delete-reason"
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="예: 정정된 명세서로 재발행"
                required
                rows={4}
                value={deleteReason}
              />
            </label>
          </div>
        ) : null}
      </FormDialog>
    </section>
  );
}
