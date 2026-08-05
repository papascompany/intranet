alter table auth_accounts
  add column if not exists session_version integer not null default 1
  check (session_version > 0);
