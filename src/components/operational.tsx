import {
  useEffect,
  useId,
  useRef,
  type FormEventHandler,
  type ReactNode
} from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import "./operational.css";

type NoticeTone = "info" | "success" | "warning" | "danger";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute("hidden"));
}

interface OperationalDialogProps {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: ReactNode;
}

function OperationalDialog({ children, className, description, onClose, open, title }: OperationalDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      getFocusableElements(dialogRef.current ?? document.body)[0]?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="operational-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cx("operational-dialog", className)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }

          if (event.key !== "Tab") {
            return;
          }

          const focusableElements = getFocusableElements(dialogRef.current ?? event.currentTarget);
          const firstElement = focusableElements[0];
          const lastElement = focusableElements.at(-1);

          if (!firstElement || !lastElement) {
            event.preventDefault();
            return;
          }

          if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="operational-dialog__header">
          <div className="operational-dialog__heading">
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button aria-label="닫기" className="operational-dialog__close" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface InlineNoticeProps {
  children: ReactNode;
  className?: string;
  onDismiss?: () => void;
  title?: ReactNode;
  tone?: NoticeTone;
}

export function InlineNotice({ children, className, onDismiss, title, tone = "info" }: InlineNoticeProps) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? TriangleAlert : tone === "danger" ? AlertCircle : Info;

  return (
    <div className={cx("operational-notice", `is-${tone}`, className)} role={tone === "danger" || tone === "warning" ? "alert" : "status"}>
      <Icon aria-hidden="true" className="operational-notice__icon" />
      <div className="operational-notice__copy">
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
      {onDismiss ? (
        <button aria-label="안내 닫기" className="operational-notice__dismiss" onClick={onDismiss} type="button">
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export interface FormDialogProps {
  busy?: boolean;
  cancelLabel?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  open: boolean;
  submitDisabled?: boolean;
  submitLabel?: ReactNode;
  title: ReactNode;
}

export function FormDialog({
  busy = false,
  cancelLabel = "취소",
  children,
  description,
  error,
  onClose,
  onSubmit,
  open,
  submitDisabled = false,
  submitLabel = "저장",
  title
}: FormDialogProps) {
  const cancel = () => {
    if (!busy) {
      onClose();
    }
  };

  return (
    <OperationalDialog className="operational-form-dialog" description={description} onClose={cancel} open={open} title={title}>
      <form onSubmit={onSubmit}>
        <div className="operational-dialog__body">{children}</div>
        {error ? <InlineNotice tone="danger" title="처리하지 못했습니다">{error}</InlineNotice> : null}
        <div className="operational-dialog__actions">
          <button disabled={busy} onClick={cancel} type="button">{cancelLabel}</button>
          <button className="is-primary" disabled={busy || submitDisabled} type="submit">
            {busy ? "처리 중..." : submitLabel}
          </button>
        </div>
      </form>
    </OperationalDialog>
  );
}

export interface ConfirmDialogProps {
  busy?: boolean;
  cancelLabel?: ReactNode;
  children?: ReactNode;
  confirmLabel?: ReactNode;
  confirmTone?: "primary" | "danger";
  description?: ReactNode;
  error?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: ReactNode;
}

export function ConfirmDialog({
  busy = false,
  cancelLabel = "취소",
  children,
  confirmLabel = "확인",
  confirmTone = "primary",
  description,
  error,
  onClose,
  onConfirm,
  open,
  title
}: ConfirmDialogProps) {
  const cancel = () => {
    if (!busy) {
      onClose();
    }
  };

  return (
    <OperationalDialog className="operational-confirm-dialog" description={description} onClose={cancel} open={open} title={title}>
      <div className="operational-dialog__body">{children}</div>
      {error ? <InlineNotice tone="danger" title="처리하지 못했습니다">{error}</InlineNotice> : null}
      <div className="operational-dialog__actions">
        <button disabled={busy} onClick={cancel} type="button">{cancelLabel}</button>
        <button className={cx("is-primary", confirmTone === "danger" && "is-danger")} disabled={busy} onClick={onConfirm} type="button">
          {busy ? "처리 중..." : confirmLabel}
        </button>
      </div>
    </OperationalDialog>
  );
}
