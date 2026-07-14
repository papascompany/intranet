-- Admin-created accounts use employee numbers as credentials. Keep that identifier
-- unique even when callers vary letter case.
create unique index if not exists employees_employee_number_upper_idx
  on employees (upper(employee_number))
  where employee_number is not null;

create unique index if not exists auth_accounts_employee_number_upper_idx
  on auth_accounts (upper(employee_number));
