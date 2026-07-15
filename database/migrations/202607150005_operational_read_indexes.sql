-- Keep the read paths used by the dashboard, approval queues, and history views
-- predictable as the employee roster grows beyond the pilot size.
create index if not exists employees_department_name_idx
  on employees(department, name);

create index if not exists attendance_records_work_date_idx
  on attendance_records(work_date desc, employee_id);

create index if not exists early_leave_ledger_employee_date_idx
  on early_leave_ledger(employee_id, work_date desc);

create index if not exists attendance_corrections_employee_created_idx
  on attendance_corrections(employee_id, created_at desc);

create index if not exists audit_logs_created_at_idx
  on audit_logs(created_at desc);

create index if not exists daily_work_tasks_employee_date_order_idx
  on daily_work_tasks(employee_id, work_date desc, display_order, id);
