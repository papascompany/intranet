import {
  isValidElement,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode
} from "react";
import "./erp.css";

type Align = "left" | "center" | "right";
type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function renderUnknown(value: unknown): ReactNode {
  if (value === null || value === undefined || typeof value === "boolean") {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  if (isValidElement(value)) {
    return value;
  }

  return String(value);
}

export interface ErpShellProps extends HTMLAttributes<HTMLDivElement> {
  sidebar?: ReactNode;
  topbar?: ReactNode;
  navLabel?: string;
}

export function ErpShell({ sidebar, topbar, navLabel = "ERP navigation", className, children, ...props }: ErpShellProps) {
  return (
    <div className={cx("erp-shell", className)} {...props}>
      {sidebar ? (
        <aside className="erp-shell__sidebar">
          <nav className="erp-shell__nav" aria-label={navLabel}>
            {sidebar}
          </nav>
        </aside>
      ) : null}
      <div className="erp-shell__body">
        {topbar ? <header className="erp-shell__topbar">{topbar}</header> : null}
        <main className="erp-shell__content">{children}</main>
      </div>
    </div>
  );
}

interface ErpNavItemSharedProps {
  active?: boolean;
  badge?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
}

type ErpNavItemAnchorProps = ErpNavItemSharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ErpNavItemSharedProps> & {
    href: string;
  };

type ErpNavItemButtonProps = ErpNavItemSharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ErpNavItemSharedProps | "type"> & {
    href?: undefined;
    type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  };

export type ErpNavItemProps = ErpNavItemAnchorProps | ErpNavItemButtonProps;

export function ErpNavItem({ active = false, badge, children, className, icon, ...props }: ErpNavItemProps) {
  const content = (
    <>
      {icon ? <span className="erp-nav-item__icon" aria-hidden="true">{icon}</span> : null}
      <span className="erp-nav-item__label">{children}</span>
      {badge ? <span className="erp-nav-item__badge">{badge}</span> : null}
    </>
  );

  if ("href" in props && props.href) {
    return (
      <a className={cx("erp-nav-item", active && "is-active", className)} aria-current={active ? "page" : undefined} {...props}>
        {content}
      </a>
    );
  }

  const buttonProps = props as Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ErpNavItemSharedProps | "type"> & {
    type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  };

  return (
    <button
      {...buttonProps}
      className={cx("erp-nav-item", active && "is-active", className)}
      type={buttonProps.type ?? "button"}
      aria-pressed={active}
    >
      {content}
    </button>
  );
}

export interface KpiGridProps extends HTMLAttributes<HTMLDivElement> {
  minTileWidth?: string;
}

export function KpiGrid({ className, minTileWidth = "180px", style, ...props }: KpiGridProps) {
  return (
    <div
      className={cx("erp-kpi-grid", className)}
      style={{ "--erp-kpi-min": minTileWidth, ...style } as CSSProperties}
      {...props}
    />
  );
}

export interface KpiTileProps extends HTMLAttributes<HTMLDivElement> {
  footer?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  trend?: ReactNode;
  value: ReactNode;
}

export function KpiTile({ className, footer, icon, label, trend, value, children, ...props }: KpiTileProps) {
  return (
    <section className={cx("erp-kpi-tile", className)} {...props}>
      <div className="erp-kpi-tile__head">
        <span className="erp-kpi-tile__label">{label}</span>
        {icon ? <span className="erp-kpi-tile__icon" aria-hidden="true">{icon}</span> : null}
      </div>
      <div className="erp-kpi-tile__value-row">
        <strong className="erp-kpi-tile__value">{value}</strong>
        {trend ? <span className="erp-kpi-tile__trend">{trend}</span> : null}
      </div>
      {children ? <div className="erp-kpi-tile__body">{children}</div> : null}
      {footer ? <div className="erp-kpi-tile__footer">{footer}</div> : null}
    </section>
  );
}

export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  actions?: ReactNode;
  description?: ReactNode;
  filters?: ReactNode;
  title?: ReactNode;
}

export function Toolbar({ actions, children, className, description, filters, title, ...props }: ToolbarProps) {
  return (
    <section className={cx("erp-toolbar", className)} {...props}>
      {(title || description) ? (
        <div className="erp-toolbar__copy">
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}
      {filters ? <div className="erp-toolbar__filters">{filters}</div> : null}
      {actions ? <div className="erp-toolbar__actions">{actions}</div> : null}
      {children ? <div className="erp-toolbar__extra">{children}</div> : null}
    </section>
  );
}

export interface DataTableColumn<Row extends object> {
  align?: Align;
  cell?: (row: Row, rowIndex: number) => ReactNode;
  className?: string;
  header: ReactNode;
  key: string;
  mobileLabel?: string;
  value?: keyof Row | ((row: Row, rowIndex: number) => ReactNode);
  width?: string;
}

export interface DataTableProps<Row extends object> extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  caption?: string;
  children?: ReactNode;
  columns?: readonly DataTableColumn<Row>[];
  emptyState?: ReactNode;
  getRowKey?: (row: Row, rowIndex: number) => string | number;
  rows?: readonly Row[];
}

export function DataTable<Row extends object>({
  caption,
  children,
  className,
  columns = [],
  emptyState,
  getRowKey,
  rows = [],
  ...props
}: DataTableProps<Row>) {
  const hasGeneratedRows = columns.length > 0 && rows.length > 0;

  return (
    <div className={cx("erp-data-table", className)} {...props}>
      <table>
        {caption ? <caption>{caption}</caption> : null}
        {columns.length > 0 ? (
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  className={cx(column.align && `is-${column.align}`, column.className)}
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {hasGeneratedRows
            ? rows.map((row, rowIndex) => (
                <tr key={getRowKey ? getRowKey(row, rowIndex) : rowIndex}>
                  {columns.map((column) => (
                    <td
                      className={cx(column.align && `is-${column.align}`, column.className)}
                      data-label={column.mobileLabel ?? (typeof column.header === "string" ? column.header : column.key)}
                      key={column.key}
                    >
                      {resolveCell(column, row, rowIndex)}
                    </td>
                  ))}
                </tr>
              ))
            : children}
        </tbody>
      </table>
      {!children && !hasGeneratedRows ? <div className="erp-data-table__empty">{emptyState ?? "No records"}</div> : null}
    </div>
  );
}

function resolveCell<Row extends object>(column: DataTableColumn<Row>, row: Row, rowIndex: number): ReactNode {
  if (column.cell) {
    return column.cell(row, rowIndex);
  }

  if (typeof column.value === "function") {
    return column.value(row, rowIndex);
  }

  if (column.value) {
    return renderUnknown(row[column.value]);
  }

  return null;
}

export interface DetailPanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  actions?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  title?: ReactNode;
}

export function DetailPanel({ actions, children, className, description, footer, title, ...props }: DetailPanelProps) {
  return (
    <section className={cx("erp-detail-panel", className)} {...props}>
      {(title || description || actions) ? (
        <div className="erp-detail-panel__head">
          <div>
            {title ? <h3>{title}</h3> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="erp-detail-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="erp-detail-panel__body">{children}</div>
      {footer ? <div className="erp-detail-panel__footer">{footer}</div> : null}
    </section>
  );
}

export interface InlineActionsProps extends HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end";
}

export function InlineActions({ align = "end", className, ...props }: InlineActionsProps) {
  return <div className={cx("erp-inline-actions", `is-${align}`, className)} {...props} />;
}

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  dot?: boolean;
  tone?: StatusTone;
}

export function StatusPill({ children, className, dot = true, tone = "neutral", ...props }: StatusPillProps) {
  return (
    <span className={cx("erp-status-pill", `is-${tone}`, className)} {...props}>
      {dot ? <span className="erp-status-pill__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  actions?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
}

export function EmptyState({ actions, children, className, description, icon, title, ...props }: EmptyStateProps) {
  return (
    <div className={cx("erp-empty-state", className)} {...props}>
      {icon ? <div className="erp-empty-state__icon" aria-hidden="true">{icon}</div> : null}
      <div className="erp-empty-state__copy">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="erp-empty-state__body">{children}</div> : null}
      {actions ? <div className="erp-empty-state__actions">{actions}</div> : null}
    </div>
  );
}
