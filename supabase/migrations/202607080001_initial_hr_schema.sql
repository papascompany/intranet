create extension if not exists pgcrypto;

create type public.employee_role as enum ('EMPLOYEE', 'APPROVER', 'HR_ADMIN', 'SYSTEM_ADMIN');
create type public.department_name as enum ('운영팀', '제작팀');
create type public.verification_method as enum ('GPS', 'QR', 'WIFI_IP', 'MANUAL_CLICK');
create type public.verification_status as enum (
  'GPS_PASSED',
  'GPS_FAILED_ALLOWED',
  'GPS_FAILED_QR_ALLOWED',
  'OUT_OF_RANGE',
  'MANUAL_REVIEW_REQUIRED'
);
create type public.request_status as enum ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');
create type public.leave_type as enum ('ANNUAL', 'HALF_DAY', 'SPECIAL', 'UNPAID');
create type public.correction_type as enum (
  'APPROVED_LATE',
  'APPROVED_EARLY_LEAVE',
  'CLOCK_IN_CORRECTION',
  'CLOCK_OUT_CORRECTION',
  'MISSING_RECORD_CREATED'
);
create type public.early_leave_status as enum ('APPROVED', 'FLEX_ALLOWED', 'LEAVE_RELATED', 'UNAPPROVED', 'CORRECTED');

create table public.employees (
  id text primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  role public.employee_role not null default 'EMPLOYEE',
  department public.department_name not null,
  hire_date date not null,
  employee_number text unique,
  position text,
  resident_registration_number_enc bytea,
  birthday date,
  address_enc bytea,
  mobile_enc bytea,
  emergency_contact_enc bytea,
  family_relations_enc bytea,
  payroll_bank text,
  payroll_account_enc bytea,
  annual_salary numeric(14, 0),
  severance_pay numeric(14, 0),
  income_deduction_dependents integer,
  custom_admin_fields jsonb not null default '[]'::jsonb,
  approver_id text references public.employees(id),
  pilot boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workplaces (
  id text primary key,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  allowed_radius_meters integer not null default 300,
  qr_path text not null,
  created_at timestamptz not null default now()
);

create table public.system_policies (
  id text primary key default 'system-policy',
  gps_allowed_radius_meters integer not null default 300,
  gps_failure_fallback text not null default 'QR_OR_MANUAL_EQUAL',
  payroll_employee_access text not null default 'VIEW_ONLY',
  payroll_delete_mode text not null default 'ADMIN_ONLY_SOFT_DELETE',
  overtime_pay_approver_role text not null default 'ADMIN_ONLY',
  advance_leave_exception_handling text not null default 'HR_CORRECTION',
  updated_by text references public.employees(id),
  updated_at timestamptz not null default now(),
  constraint system_policies_singleton check (id = 'system-policy')
);

create table public.verification_attempts (
  id text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  workplace_id text references public.workplaces(id),
  method public.verification_method not null,
  status public.verification_status not null,
  attempted_at timestamptz not null,
  distance_meters integer,
  accuracy_meters integer,
  note text
);

create table public.attendance_records (
  id text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  work_date date not null,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  status public.verification_status not null,
  verification_id text not null references public.verification_attempts(id),
  early_leave_minutes integer not null default 0,
  unique (employee_id, work_date)
);

create table public.leave_balances (
  employee_id text primary key references public.employees(id) on delete cascade,
  statutory_days numeric(5, 2) not null default 0,
  advance_granted_days numeric(5, 2) not null default 0,
  advance_used_days numeric(5, 2) not null default 0,
  available_days numeric(5, 2) not null default 0,
  pending_offset_days numeric(5, 2) not null default 0,
  updated_at timestamptz not null default now()
);

create table public.leave_requests (
  id text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  type public.leave_type not null,
  starts_on date not null,
  ends_on date not null,
  days numeric(5, 2) not null,
  reason text not null,
  status public.request_status not null default 'PENDING',
  decided_by text references public.employees(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.early_leave_ledger (
  id text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  work_date date not null,
  minutes integer not null,
  status public.early_leave_status not null default 'UNAPPROVED',
  reason text,
  created_at timestamptz not null default now()
);

create table public.overtime_requests (
  id text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  work_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  minutes integer not null,
  reason text not null,
  status public.request_status not null default 'PENDING',
  pay_approved boolean not null default false,
  decided_by text references public.employees(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.attendance_corrections (
  id text primary key,
  attendance_id text not null references public.attendance_records(id) on delete cascade,
  employee_id text not null references public.employees(id) on delete cascade,
  corrected_by_id text not null references public.employees(id),
  type public.correction_type not null,
  before_value text,
  after_value text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.payroll_statements (
  id text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  payroll_month text not null,
  storage_bucket text not null default 'payroll-statements',
  storage_path text,
  filename text not null,
  uploaded_by text not null references public.employees(id),
  uploaded_at timestamptz not null default now(),
  deleted_by text references public.employees(id),
  deleted_at timestamptz,
  delete_reason text
);

create table public.audit_logs (
  id text primary key,
  actor_employee_id text not null references public.employees(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  detail text not null,
  before_json jsonb,
  after_json jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index employees_auth_user_id_idx on public.employees(auth_user_id);
create index attendance_records_employee_date_idx on public.attendance_records(employee_id, work_date desc);
create index leave_requests_employee_status_idx on public.leave_requests(employee_id, status);
create index overtime_requests_employee_status_idx on public.overtime_requests(employee_id, status);
create index payroll_statements_employee_month_idx on public.payroll_statements(employee_id, payroll_month desc);
create index audit_logs_target_idx on public.audit_logs(target_type, target_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs(actor_employee_id, created_at desc);

create or replace function public.current_employee_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where auth_user_id = auth.uid()
$$;

create or replace function public.current_employee_role()
returns public.employee_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.employees where auth_user_id = auth.uid()
$$;

create or replace function public.is_hr_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_employee_role() in ('HR_ADMIN', 'SYSTEM_ADMIN')
$$;

create or replace function public.can_approve()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_employee_role() in ('APPROVER', 'HR_ADMIN', 'SYSTEM_ADMIN')
$$;

alter table public.employees enable row level security;
alter table public.workplaces enable row level security;
alter table public.system_policies enable row level security;
alter table public.verification_attempts enable row level security;
alter table public.attendance_records enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
alter table public.early_leave_ledger enable row level security;
alter table public.overtime_requests enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.payroll_statements enable row level security;
alter table public.audit_logs enable row level security;

create policy employees_read_self_or_admin on public.employees
  for select using (id = public.current_employee_id() or public.is_hr_admin());
create policy employees_admin_write on public.employees
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

create policy workplaces_read_authenticated on public.workplaces
  for select using (auth.uid() is not null);
create policy workplaces_admin_write on public.workplaces
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

create policy system_policies_read_authenticated on public.system_policies
  for select using (auth.uid() is not null);
create policy system_policies_admin_write on public.system_policies
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

create policy attendance_read_self_or_admin on public.attendance_records
  for select using (employee_id = public.current_employee_id() or public.is_hr_admin());
create policy attendance_insert_self on public.attendance_records
  for insert with check (employee_id = public.current_employee_id() or public.is_hr_admin());
create policy attendance_update_self_or_admin on public.attendance_records
  for update using (employee_id = public.current_employee_id() or public.is_hr_admin())
  with check (employee_id = public.current_employee_id() or public.is_hr_admin());

create policy verification_read_self_or_admin on public.verification_attempts
  for select using (employee_id = public.current_employee_id() or public.is_hr_admin());
create policy verification_insert_self on public.verification_attempts
  for insert with check (employee_id = public.current_employee_id() or public.is_hr_admin());

create policy leave_balances_read_self_or_admin on public.leave_balances
  for select using (employee_id = public.current_employee_id() or public.is_hr_admin());
create policy leave_balances_admin_write on public.leave_balances
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

create policy leave_requests_read_self_approver_or_admin on public.leave_requests
  for select using (employee_id = public.current_employee_id() or public.can_approve());
create policy leave_requests_insert_self on public.leave_requests
  for insert with check (employee_id = public.current_employee_id() or public.is_hr_admin());
create policy leave_requests_update_approver_or_admin on public.leave_requests
  for update using (public.can_approve()) with check (public.can_approve());

create policy early_leave_read_self_or_admin on public.early_leave_ledger
  for select using (employee_id = public.current_employee_id() or public.is_hr_admin());
create policy early_leave_admin_write on public.early_leave_ledger
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

create policy overtime_read_self_approver_or_admin on public.overtime_requests
  for select using (employee_id = public.current_employee_id() or public.can_approve());
create policy overtime_insert_self on public.overtime_requests
  for insert with check (employee_id = public.current_employee_id() or public.is_hr_admin());
create policy overtime_update_approver_or_admin on public.overtime_requests
  for update using (public.can_approve()) with check (public.can_approve());

create policy corrections_read_self_or_admin on public.attendance_corrections
  for select using (employee_id = public.current_employee_id() or public.is_hr_admin());
create policy corrections_admin_write on public.attendance_corrections
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

create policy payroll_read_self_or_admin on public.payroll_statements
  for select using ((employee_id = public.current_employee_id() and deleted_at is null) or public.is_hr_admin());
create policy payroll_admin_write on public.payroll_statements
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

create policy audit_read_self_or_admin on public.audit_logs
  for select using (actor_employee_id = public.current_employee_id() or public.is_hr_admin());
create policy audit_insert_authenticated on public.audit_logs
  for insert with check (auth.uid() is not null);

insert into public.system_policies (id)
values ('system-policy')
on conflict (id) do nothing;
