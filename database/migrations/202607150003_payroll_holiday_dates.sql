alter table system_policies
  add column if not exists payroll_holiday_dates jsonb not null default '[]'::jsonb;
