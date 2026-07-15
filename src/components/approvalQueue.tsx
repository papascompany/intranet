import { useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Check, Clock3, FileText, X } from "lucide-react";
import type { Employee, LeaveRequest, OvertimeRequest } from "../domain/types";
import { ConfirmDialog, FormDialog, InlineNotice } from "./operational";
import "./approvalQueue.css";

export type ApprovalQueueItem =
  | { kind: "leave"; request: LeaveRequest }
  | { kind: "overtime"; request: OvertimeRequest };

export interface ApprovalQueueProps {
  busy?: boolean;
  employees?: readonly Pick<Employee, "id" | "name" | "department">[];
  error?: string | null;
  leaveRequests: readonly LeaveRequest[];
  onApprove: (item: ApprovalQueueItem) => void | Promise<void>;
  onReject: (item: ApprovalQueueItem, reason: string) => void | Promise<void>;
  overtimeRequests: readonly OvertimeRequest[];
}

type DialogState = "approve" | "reject" | null;
type ListMode = "pending" | "history";

function formatDays(days: number) {
  return `${Number.isInteger(days) ? days : days.toFixed(1)}일`;
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours ? `${hours}시간${remainingMinutes ? ` ${remainingMinutes}분` : ""}` : `${remainingMinutes}분`;
}

function personLabel(item: ApprovalQueueItem, employees: ApprovalQueueProps["employees"]) {
  const employee = employees?.find((candidate) => candidate.id === item.request.employeeId);
  return employee ? `${employee.name} · ${employee.department}` : item.request.employeeId;
}

function requestTitle(item: ApprovalQueueItem) {
  return item.kind === "leave" ? "휴가 신청" : "야근 신청";
}

function requestSummary(item: ApprovalQueueItem) {
  if (item.kind === "leave") {
    const { endsOn, startsOn, days } = item.request;
    return `${startsOn}${startsOn === endsOn ? "" : ` ~ ${endsOn}`} · ${formatDays(days)}`;
  }

  return `${item.request.date} · ${formatMinutes(item.request.minutes)}`;
}

export function ApprovalQueue({
  busy = false,
  employees,
  error,
  leaveRequests,
  onApprove,
  onReject,
  overtimeRequests
}: ApprovalQueueProps) {
  const items = useMemo<ApprovalQueueItem[]>(
    () => [
      ...leaveRequests.filter((request) => request.status === "PENDING").map((request) => ({ kind: "leave" as const, request })),
      ...overtimeRequests.filter((request) => request.status === "PENDING").map((request) => ({ kind: "overtime" as const, request }))
    ],
    [leaveRequests, overtimeRequests]
  );
  const historyItems = useMemo<ApprovalQueueItem[]>(
    () => [
      ...leaveRequests.filter((request) => request.status !== "PENDING").map((request) => ({ kind: "leave" as const, request })),
      ...overtimeRequests.filter((request) => request.status !== "PENDING").map((request) => ({ kind: "overtime" as const, request }))
    ],
    [leaveRequests, overtimeRequests]
  );
  const [listMode, setListMode] = useState<ListMode>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const visibleItems = listMode === "pending" ? items : historyItems;
  const selectedItem = visibleItems.find((item) => item.request.id === selectedId) ?? null;
  const isBusy = busy || isSubmitting;
  const visibleError = actionError ?? error;

  const closeDialog = () => {
    if (!isBusy) {
      setDialog(null);
      setRejectionReason("");
      setActionError(null);
    }
  };

  const runAction = async (action: () => void | Promise<void>) => {
    setActionError(null);
    setIsSubmitting(true);
    try {
      await action();
      setDialog(null);
      setRejectionReason("");
      setListMode("history");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRejection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedItem || !rejectionReason.trim()) return;
    void runAction(() => onReject(selectedItem, rejectionReason.trim()));
  };

  return (
    <section aria-labelledby="approval-queue-title" className="approval-queue">
      <header className="approval-queue__header">
        <div>
          <p className="approval-queue__eyebrow"><FileText aria-hidden="true" /> 승인 업무</p>
          <h2 id="approval-queue-title">{listMode === "pending" ? "대기 요청" : "처리 완료 이력"}</h2>
          <p>요청을 선택하면 신청 내용과 처리 결과를 다시 확인할 수 있습니다.</p>
        </div>
        <span className="approval-queue__count" aria-label={`${listMode === "pending" ? "대기 요청" : "처리 완료 이력"} ${visibleItems.length}건`}>{visibleItems.length}건</span>
      </header>

      {visibleError && !dialog ? <InlineNotice tone="danger" title="승인 업무를 처리하지 못했습니다">{visibleError}</InlineNotice> : null}

      <div className="approval-queue__content">
        <div className="approval-queue__list-panel">
          <div aria-label="승인 목록 보기" className="approval-queue__tabs" role="tablist">
            <button aria-selected={listMode === "pending"} className={listMode === "pending" ? "is-active" : ""} onClick={() => { setListMode("pending"); setActionError(null); }} role="tab" type="button">
              대기 <span>{items.length}</span>
            </button>
            <button aria-selected={listMode === "history"} className={listMode === "history" ? "is-active" : ""} onClick={() => { setListMode("history"); setActionError(null); }} role="tab" type="button">
              처리 완료 <span>{historyItems.length}</span>
            </button>
          </div>
          <div aria-label={listMode === "pending" ? "대기 요청 목록" : "처리 완료 이력 목록"} className="approval-queue__list" role="list">
          {visibleItems.length ? visibleItems.map((item) => {
            const selected = item.request.id === selectedItem?.request.id;
            return (
              <button
                aria-pressed={selected}
                className={`approval-queue-row${selected ? " is-selected" : ""}`}
                key={`${item.kind}-${item.request.id}`}
                onClick={() => {
                  setSelectedId(item.request.id);
                  setActionError(null);
                }}
                type="button"
              >
                <span className={`approval-queue-row__type is-${item.kind}`}>
                  {item.kind === "leave" ? <CalendarClock aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
                  {requestTitle(item)}
                </span>
                <strong>{personLabel(item, employees)}</strong>
                <span className="approval-queue-row__summary">{requestSummary(item)}</span>
                <small className={`approval-queue-row__status is-${item.request.status.toLowerCase()}`}>{requestStatusLabel(item.request.status)}</small>
              </button>
            );
          }) : <div className="approval-queue__empty">{listMode === "pending" ? "처리할 대기 요청이 없습니다." : "처리 완료된 요청이 없습니다."}</div>}
          </div>
        </div>

        <div aria-live="polite" className="approval-queue__detail">
          {selectedItem ? (
            <>
              <div className="approval-queue__detail-heading">
                <span className={`approval-queue-row__type is-${selectedItem.kind}`}>{requestTitle(selectedItem)}</span>
                <h3>{personLabel(selectedItem, employees)}</h3>
                <p>{requestSummary(selectedItem)}</p>
              </div>
              <dl>
                {selectedItem.kind === "leave" ? (
                  <>
                    <div><dt>휴가 유형</dt><dd>{leaveTypeLabel(selectedItem.request.type)}</dd></div>
                    <div><dt>휴가 일수</dt><dd>{formatDays(selectedItem.request.days)}</dd></div>
                  </>
                ) : (
                  <>
                    <div><dt>야근 시간</dt><dd>{formatMinutes(selectedItem.request.minutes)}</dd></div>
                    <div><dt>신청 시간</dt><dd>{formatTimeRange(selectedItem.request.startsAt, selectedItem.request.endsAt)}</dd></div>
                  </>
                )}
                <div className="approval-queue__detail-reason"><dt>신청 사유</dt><dd>{selectedItem.request.reason}</dd></div>
              </dl>
              {selectedItem.request.status === "PENDING" ? (
                <div className="approval-queue__actions">
                  <button className="approval-queue__reject" disabled={isBusy} onClick={() => setDialog("reject")} type="button"><X aria-hidden="true" /> 반려</button>
                  <button className="approval-queue__approve" disabled={isBusy} onClick={() => setDialog("approve")} type="button"><Check aria-hidden="true" /> 승인</button>
                </div>
              ) : (
                <dl className="approval-queue__resolution">
                  <div><dt>처리 결과</dt><dd>{requestStatusLabel(selectedItem.request.status)}</dd></div>
                  <div><dt>처리 시각</dt><dd>{selectedItem.request.decidedAt ? formatCreatedAt(selectedItem.request.decidedAt) : "기록 없음"}</dd></div>
                  <div><dt>처리자</dt><dd>{selectedItem.request.decidedBy ? employeeName(selectedItem.request.decidedBy, employees) : "기록 없음"}</dd></div>
                </dl>
              )}
            </>
          ) : <div className="approval-queue__placeholder">목록에서 대기 요청을 선택해 주세요.</div>}
        </div>
      </div>

      <ConfirmDialog
        busy={isBusy}
        confirmLabel="승인하기"
        description="승인 후에는 근태 및 휴가·야근 처리에 반영됩니다."
        error={visibleError ?? undefined}
        onClose={closeDialog}
        onConfirm={() => selectedItem ? void runAction(() => onApprove(selectedItem)) : undefined}
        open={dialog === "approve" && selectedItem !== null}
        title={`${selectedItem ? requestTitle(selectedItem) : "요청"}을 승인할까요?`}
      >
        {selectedItem ? <strong>{personLabel(selectedItem, employees)} · {requestSummary(selectedItem)}</strong> : null}
      </ConfirmDialog>

      <FormDialog
        busy={isBusy}
        description="반려 사유는 신청자에게 전달됩니다. 구체적인 보완 내용을 입력해 주세요."
        error={visibleError ?? undefined}
        onClose={closeDialog}
        onSubmit={submitRejection}
        open={dialog === "reject" && selectedItem !== null}
        submitDisabled={!rejectionReason.trim()}
        submitLabel="반려하기"
        title={`${selectedItem ? requestTitle(selectedItem) : "요청"} 반려`}
      >
        <label className="approval-queue__reason-label" htmlFor="approval-rejection-reason">
          반려 사유
          <textarea
            id="approval-rejection-reason"
            onChange={(event) => setRejectionReason(event.target.value)}
            placeholder="반려 사유를 입력해 주세요."
            required
            rows={4}
            value={rejectionReason}
          />
        </label>
      </FormDialog>
    </section>
  );
}

function leaveTypeLabel(type: LeaveRequest["type"]) {
  return ({ ANNUAL: "연차", HALF_DAY: "반차", SPECIAL: "특별휴가", UNPAID: "무급휴가" } as const)[type];
}

function formatTimeRange(startsAt: string, endsAt: string) {
  return `${startsAt.slice(11, 16)} - ${endsAt.slice(11, 16)}`;
}

function requestStatusLabel(status: ApprovalQueueItem["request"]["status"]) {
  return ({ DRAFT: "초안", PENDING: "대기", APPROVED: "승인", REJECTED: "반려", CANCELLED: "취소" } as const)[status];
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function employeeName(employeeId: string, employees: ApprovalQueueProps["employees"]) {
  return employees?.find((employee) => employee.id === employeeId)?.name ?? employeeId;
}
