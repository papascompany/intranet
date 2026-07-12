create table if not exists daily_work_tasks (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  department text not null check (department in ('운영팀', '제작팀')),
  work_date date not null,
  title text not null,
  due_label text,
  display_order integer not null default 0,
  status text not null default 'TODO' check (status in ('TODO', 'IN_PROGRESS', 'DONE')),
  completed_at timestamptz,
  constraint daily_work_tasks_completed_at_check check (
    (status = 'DONE' and completed_at is not null) or (status <> 'DONE' and completed_at is null)
  )
);

create index if not exists daily_work_tasks_employee_date_order_idx
  on daily_work_tasks(employee_id, work_date, display_order, id);
