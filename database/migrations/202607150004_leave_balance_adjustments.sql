create table if not exists leave_balance_adjustments (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  days numeric(6, 2) not null check (days <> 0),
  reason text not null check (nullif(btrim(reason), '') is not null),
  created_by text not null references employees(id),
  created_at timestamptz not null default now()
);

create index if not exists leave_balance_adjustments_employee_created_idx
  on leave_balance_adjustments(employee_id, created_at desc);
