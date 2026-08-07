alter table system_policies
  add column if not exists leave_reason_required boolean not null default false;

comment on column system_policies.leave_reason_required is
  '직원 휴가 신청 시 사유 입력을 필수로 요구할지 여부';
