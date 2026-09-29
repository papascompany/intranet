create table if not exists password_recovery_requests (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  employee_name text not null,
  employee_number text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED')),
  requested_at timestamptz not null default now(),
  resolved_by text references employees(id),
  resolved_at timestamptz,
  constraint password_recovery_requests_resolution_consistent check (
    (status = 'PENDING' and resolved_by is null and resolved_at is null)
    or (status = 'COMPLETED' and resolved_by is not null and resolved_at is not null)
  )
);

create unique index if not exists password_recovery_requests_one_pending_per_employee_idx
  on password_recovery_requests(employee_id)
  where status = 'PENDING';

create index if not exists password_recovery_requests_pending_requested_at_idx
  on password_recovery_requests(requested_at)
  where status = 'PENDING';
