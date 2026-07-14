alter table employees
  add column if not exists employment_status text not null default 'ACTIVE'
    check (employment_status in ('ACTIVE', 'LEAVE', 'TERMINATED')),
  add column if not exists employment_type text not null default 'REGULAR'
    check (employment_type in ('REGULAR', 'CONTRACT', 'PART_TIME')),
  add column if not exists termination_date date,
  add column if not exists annual_leave_adjustment_days numeric(6, 2) not null default 0;

alter table system_policies
  add column if not exists timezone text not null default 'Asia/Seoul',
  add column if not exists work_start_time time not null default '08:00',
  add column if not exists work_end_time time not null default '17:00',
  add column if not exists break_start_time time not null default '12:00',
  add column if not exists break_end_time time not null default '13:00',
  add column if not exists work_days jsonb not null default '["MON","TUE","WED","THU","FRI"]'::jsonb,
  add column if not exists annual_leave_auto_accrual boolean not null default true,
  add column if not exists annual_leave_unit numeric(2, 1) not null default 0.5
    check (annual_leave_unit in (0.5, 1.0)),
  add column if not exists partial_leave_allowed boolean not null default true,
  add column if not exists annual_leave_overuse_allowed boolean not null default false;
