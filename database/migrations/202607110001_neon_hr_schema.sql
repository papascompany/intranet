create table if not exists employees (
  id text primary key,
  auth_user_id text unique,
  name text not null,
  role text not null default 'EMPLOYEE' check (role in ('EMPLOYEE', 'APPROVER', 'HR_ADMIN', 'SYSTEM_ADMIN')),
  department text not null check (department in ('운영팀', '제작팀')),
  hire_date date not null,
  employee_number text unique,
  position text,
  resident_registration_number_enc text,
  birthday date,
  address_enc text,
  mobile_enc text,
  emergency_contact_enc text,
  family_relations_enc text,
  payroll_bank text,
  payroll_account_enc text,
  annual_salary numeric(14, 0),
  severance_pay numeric(14, 0),
  income_deduction_dependents integer,
  custom_admin_fields jsonb not null default '[]'::jsonb,
  approver_id text references employees(id),
  pilot boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workplaces (
  id text primary key,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  allowed_radius_meters integer not null default 300,
  qr_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists system_policies (
  id text primary key default 'system-policy',
  gps_allowed_radius_meters integer not null default 300,
  gps_failure_fallback text not null default 'QR_OR_MANUAL_EQUAL',
  payroll_employee_access text not null default 'VIEW_ONLY',
  payroll_delete_mode text not null default 'ADMIN_ONLY_SOFT_DELETE',
  overtime_pay_approver_role text not null default 'ADMIN_ONLY',
  advance_leave_exception_handling text not null default 'HR_CORRECTION',
  updated_by text references employees(id),
  updated_at timestamptz not null default now(),
  constraint system_policies_singleton check (id = 'system-policy')
);

create table if not exists verification_attempts (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  workplace_id text references workplaces(id),
  method text not null check (method in ('GPS', 'QR', 'WIFI_IP', 'MANUAL_CLICK')),
  status text not null,
  attempted_at timestamptz not null,
  distance_meters integer,
  accuracy_meters integer,
  note text
);

create table if not exists attendance_records (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  work_date date not null,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  status text not null,
  verification_id text not null references verification_attempts(id),
  early_leave_minutes integer not null default 0,
  unique (employee_id, work_date)
);

create table if not exists leave_requests (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  type text not null check (type in ('ANNUAL', 'HALF_DAY', 'SPECIAL', 'UNPAID')),
  starts_on date not null,
  ends_on date not null,
  days numeric(5, 2) not null,
  reason text not null,
  status text not null default 'PENDING' check (status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED')),
  decided_by text references employees(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists early_leave_ledger (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  work_date date not null,
  minutes integer not null,
  status text not null default 'UNAPPROVED',
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists overtime_requests (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  work_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  minutes integer not null,
  reason text not null,
  status text not null default 'PENDING' check (status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED')),
  pay_approved boolean not null default false,
  decided_by text references employees(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists attendance_corrections (
  id text primary key,
  attendance_id text not null references attendance_records(id) on delete cascade,
  employee_id text not null references employees(id) on delete cascade,
  corrected_by_id text not null references employees(id),
  type text not null,
  before_value text,
  after_value text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists payroll_statements (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  payroll_month text not null,
  storage_bucket text not null default 'vercel-blob',
  storage_path text not null,
  filename text not null,
  uploaded_by text not null references employees(id),
  uploaded_at timestamptz not null default now(),
  deleted_by text references employees(id),
  deleted_at timestamptz,
  delete_reason text,
  constraint payroll_delete_metadata_required check (
    (deleted_at is null and deleted_by is null and delete_reason is null)
    or
    (deleted_at is not null and deleted_by is not null and nullif(btrim(delete_reason), '') is not null)
  )
);

create table if not exists audit_logs (
  id text primary key,
  actor_employee_id text not null references employees(id),
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

create index if not exists employees_auth_user_id_idx on employees(auth_user_id);
create index if not exists attendance_records_employee_date_idx on attendance_records(employee_id, work_date desc);
create index if not exists leave_requests_employee_status_idx on leave_requests(employee_id, status);
create index if not exists overtime_requests_employee_status_idx on overtime_requests(employee_id, status);
create index if not exists payroll_statements_employee_month_idx on payroll_statements(employee_id, payroll_month desc);
create index if not exists audit_logs_target_idx on audit_logs(target_type, target_id, created_at desc);
create index if not exists audit_logs_actor_idx on audit_logs(actor_employee_id, created_at desc);

insert into system_policies (id)
values ('system-policy')
on conflict (id) do nothing;
