update early_leave_ledger
set status = 'FLEX_ALLOWED',
    reason = '개인별 근무시간 정책 자동 인정'
where status = 'UNAPPROVED'
  and reason = '실제 퇴근 기록 기준';

update web_push_subscriptions
set alert_clock_in = true,
    alert_clock_out = true,
    updated_at = now()
where alert_clock_in = false
   or alert_clock_out = false;

alter table web_push_subscriptions
  drop constraint if exists web_push_subscriptions_mandatory_attendance_alerts_check;

alter table web_push_subscriptions
  add constraint web_push_subscriptions_mandatory_attendance_alerts_check
    check (alert_clock_in = true and alert_clock_out = true);
