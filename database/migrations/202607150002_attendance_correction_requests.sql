create table if not exists attendance_correction_requests (
  id text primary key,
  attendance_id text references attendance_records(id) on delete set null,
  employee_id text not null references employees(id) on delete cascade,
  type text not null check (type in ('APPROVED_LATE', 'APPROVED_EARLY_LEAVE', 'CLOCK_IN_CORRECTION', 'CLOCK_OUT_CORRECTION', 'MISSING_RECORD_CREATED')),
  before_value text,
  requested_value text not null,
  reason text not null check (length(btrim(reason)) > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  decided_by text references employees(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_correction_request_decision_metadata_check check (
    (status = 'PENDING' and decided_by is null and decided_at is null)
    or
    (status <> 'PENDING' and decided_by is not null and decided_at is not null)
  )
);

create index if not exists attendance_correction_requests_status_idx
  on attendance_correction_requests(status, created_at desc);

create index if not exists attendance_correction_requests_employee_idx
  on attendance_correction_requests(employee_id, created_at desc);
