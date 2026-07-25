create table if not exists web_push_subscriptions (
  id bigint generated always as identity primary key,
  employee_id text not null references employees(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  device_label text not null default 'iPhone',
  alert_clock_in boolean not null default true,
  alert_clock_out boolean not null default true,
  enabled boolean not null default true,
  deliver_from timestamptz not null default now(),
  failure_count integer not null default 0,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_push_subscriptions_admin_idx
  on web_push_subscriptions(employee_id, enabled, updated_at desc);

create table if not exists web_push_deliveries (
  id bigint generated always as identity primary key,
  audit_log_id text not null references audit_logs(id) on delete cascade,
  subscription_id bigint not null references web_push_subscriptions(id) on delete cascade,
  status text not null default 'PROCESSING' check (status in ('PROCESSING', 'SENT', 'FAILED', 'EXPIRED')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_log_id, subscription_id)
);

create index if not exists web_push_deliveries_retry_idx
  on web_push_deliveries(status, next_attempt_at)
  where status = 'FAILED';
