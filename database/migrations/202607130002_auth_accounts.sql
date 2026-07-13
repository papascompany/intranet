create table if not exists auth_accounts (
  id text primary key,
  employee_id text not null unique references employees(id) on delete cascade,
  employee_number text not null unique,
  password_hash text not null,
  password_changed_at timestamptz not null default now(),
  failed_sign_in_count integer not null default 0 check (failed_sign_in_count >= 0),
  locked_until timestamptz,
  last_signed_in_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_accounts_password_hash_not_empty check (nullif(btrim(password_hash), '') is not null)
);

create index if not exists auth_accounts_active_employee_number_idx
  on auth_accounts(employee_number)
  where disabled_at is null;
