alter table employees
  add column if not exists work_start_time time,
  add column if not exists work_end_time time;

alter table attendance_records
  add column if not exists recognized_work_minutes integer not null default 0;

update attendance_records
set recognized_work_minutes = early_leave_minutes
where recognized_work_minutes = 0
  and early_leave_minutes > 0;

alter table employees
  drop constraint if exists employees_work_hours_check;

alter table employees
  add constraint employees_work_hours_check check (
    (work_start_time is null and work_end_time is null)
    or (work_start_time is not null and work_end_time is not null and work_start_time < work_end_time)
  );

alter table attendance_records
  drop constraint if exists attendance_records_recognized_work_minutes_check;

alter table attendance_records
  add constraint attendance_records_recognized_work_minutes_check check (recognized_work_minutes >= 0);
