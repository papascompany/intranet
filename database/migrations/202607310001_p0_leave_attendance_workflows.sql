alter table leave_requests
  add column if not exists half_day_period text;

alter table leave_requests
  drop constraint if exists leave_requests_half_day_period_check;

alter table leave_requests
  add constraint leave_requests_half_day_period_check
    check (half_day_period is null or half_day_period in ('AM', 'PM'));

alter table attendance_records
  add column if not exists evidence_response text,
  add column if not exists evidence_submitted_at timestamptz;

alter table attendance_records
  drop constraint if exists attendance_records_review_status_check;

alter table attendance_records
  add constraint attendance_records_review_status_check
    check (review_status in ('NOT_REQUIRED', 'PENDING', 'CONFIRMED', 'EVIDENCE_REQUESTED', 'EVIDENCE_SUBMITTED', 'CORRECTED'));

drop index if exists attendance_records_pending_review_idx;

create index if not exists attendance_records_pending_review_idx
  on attendance_records(review_status, work_date desc)
  where review_status in ('PENDING', 'EVIDENCE_REQUESTED', 'EVIDENCE_SUBMITTED');
