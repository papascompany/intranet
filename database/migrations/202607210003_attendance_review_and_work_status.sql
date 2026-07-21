alter table attendance_records
  add column if not exists work_status text not null default 'NORMAL',
  add column if not exists late_minutes integer not null default 0,
  add column if not exists review_status text not null default 'NOT_REQUIRED',
  add column if not exists reviewed_by_id text references employees(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

with default_schedule as (
  select work_start_time
  from system_policies
  where id = 'system-policy'
)
update attendance_records as attendance
set
  late_minutes = case
    when attendance.clock_in_at is null then 0
    else greatest(
      ceil(extract(epoch from (
        (attendance.clock_in_at at time zone 'Asia/Seoul')::time
        - coalesce(employee.work_start_time, default_schedule.work_start_time)
      )) / 60)::integer,
      0
    )
  end,
  work_status = case
    when attendance.clock_in_at is not null
      and (attendance.clock_in_at at time zone 'Asia/Seoul')::time
        > coalesce(employee.work_start_time, default_schedule.work_start_time)
      then 'LATE'
    else 'NORMAL'
  end,
  review_status = case
    when attendance.status in ('OUT_OF_RANGE', 'MANUAL_REVIEW_REQUIRED') then 'PENDING'
    else 'NOT_REQUIRED'
  end
from employees as employee
cross join default_schedule
where employee.id = attendance.employee_id;

alter table attendance_records
  drop constraint if exists attendance_records_work_status_check,
  drop constraint if exists attendance_records_late_minutes_check,
  drop constraint if exists attendance_records_review_status_check;

alter table attendance_records
  add constraint attendance_records_work_status_check
    check (work_status in ('NORMAL', 'LATE')),
  add constraint attendance_records_late_minutes_check
    check (late_minutes >= 0),
  add constraint attendance_records_review_status_check
    check (review_status in ('NOT_REQUIRED', 'PENDING', 'CONFIRMED', 'EVIDENCE_REQUESTED', 'CORRECTED'));

create index if not exists attendance_records_pending_review_idx
  on attendance_records(review_status, work_date desc)
  where review_status in ('PENDING', 'EVIDENCE_REQUESTED');
