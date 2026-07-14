-- Operational integrity constraints for approval and payroll workflows.
alter table if exists leave_requests
  add column if not exists decided_by text references employees(id),
  add column if not exists decided_at timestamptz;

alter table if exists overtime_requests
  add column if not exists decided_by text references employees(id),
  add column if not exists decided_at timestamptz;

alter table if exists leave_requests drop constraint if exists leave_requests_status_check;
alter table if exists leave_requests add constraint leave_requests_status_check
  check (status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

alter table if exists overtime_requests drop constraint if exists overtime_requests_status_check;
alter table if exists overtime_requests add constraint overtime_requests_status_check
  check (status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

create unique index if not exists payroll_statements_active_employee_month_idx
  on payroll_statements(employee_id, payroll_month)
  where deleted_at is null;

create index if not exists leave_requests_approver_queue_idx
  on leave_requests(status, created_at desc);

create index if not exists overtime_requests_approver_queue_idx
  on overtime_requests(status, created_at desc);
