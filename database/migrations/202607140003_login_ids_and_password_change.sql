-- User-facing login IDs are intentionally separate from internal employee numbers.
alter table auth_accounts
  add column if not exists login_id text;

alter table auth_accounts
  add column if not exists password_change_required boolean not null default false;

-- Preserve access to the pre-existing account while moving it away from employee-number login.
update auth_accounts
set login_id = case
  when employee_number = 'TS001' then 'thestorage-admin'
  else concat('legacy-', lower(employee_number))
end
where login_id is null or btrim(login_id) = '';

alter table auth_accounts
  alter column login_id set not null;

create unique index if not exists auth_accounts_login_id_lower_idx
  on auth_accounts (lower(login_id));
