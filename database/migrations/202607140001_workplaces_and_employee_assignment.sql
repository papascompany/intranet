alter table employees
  add column if not exists workplace_id text references workplaces(id) on delete set null;

create index if not exists employees_workplace_id_idx on employees(workplace_id);

insert into workplaces (id, name, latitude, longitude, allowed_radius_meters, qr_path)
values
  ('samsong-techno-valley', '삼송테크노밸리', 37.649070, 126.901901, 300, '/qr/samsong-techno-valley'),
  ('ace-highend-jichuk', '에이스하이엔드타워 지축역', 37.643093, 126.883733, 300, '/qr/ace-highend-jichuk')
on conflict (id) do update set
  name = excluded.name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  qr_path = excluded.qr_path;
