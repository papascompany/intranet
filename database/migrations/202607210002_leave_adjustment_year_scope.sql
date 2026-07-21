alter table employees
  add column if not exists annual_leave_adjustment_year integer;

update employees
set annual_leave_adjustment_year = extract(year from current_date)::integer
where annual_leave_adjustment_year is null
  and coalesce(annual_leave_adjustment_days, 0) <> 0;

alter table leave_balance_adjustments
  add column if not exists leave_year integer;

update leave_balance_adjustments
set leave_year = extract(year from created_at)::integer
where leave_year is null;

alter table employees
  drop constraint if exists employees_annual_leave_adjustment_year_check;

alter table employees
  add constraint employees_annual_leave_adjustment_year_check check (
    annual_leave_adjustment_year is null
    or annual_leave_adjustment_year between 2000 and 2100
  );

alter table leave_balance_adjustments
  drop constraint if exists leave_balance_adjustments_leave_year_check;

alter table leave_balance_adjustments
  add constraint leave_balance_adjustments_leave_year_check check (
    leave_year is null
    or leave_year between 2000 and 2100
  );
