alter table daily_work_tasks
  add constraint daily_work_tasks_title_not_blank_check check (length(btrim(title)) > 0),
  add constraint daily_work_tasks_display_order_nonnegative_check check (display_order >= 0);
