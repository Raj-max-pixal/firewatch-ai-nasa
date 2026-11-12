create table if not exists ingestion_runs (
  id bigserial primary key,
  source text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed')),
  records_received integer not null default 0,
  records_written integer not null default 0,
  sensor_counts jsonb not null default '{}'::jsonb,
  area_bounds text,
  notes text
);

create table if not exists fire_observations (
  observation_uid text primary key,
  source_record_id text not null,
  sensor text not null check (sensor in ('MODIS','VIIRS')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  acquired_at timestamptz not null,
  confidence double precision not null default 0 check (confidence between 0 and 100),
  frp_mw double precision not null default 0,
  region text not null default 'Selected area',
  source text not null,
  grid_cell text not null,
  possible_overlap boolean not null default false,
  ingestion_run_id bigint references ingestion_runs(id) on delete set null,
  raw_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source, sensor, source_record_id)
);

create index if not exists fire_observations_acquired_idx on fire_observations(acquired_at desc);
create index if not exists fire_observations_sensor_time_idx on fire_observations(sensor, acquired_at desc);
create index if not exists fire_observations_grid_time_idx on fire_observations(grid_cell, acquired_at desc);
create index if not exists fire_observations_region_idx on fire_observations(region);

alter table ingestion_runs enable row level security;
alter table fire_observations enable row level security;

create or replace view fire_activity_daily with (security_invoker = true) as
select
  date_trunc('day', acquired_at) as utc_day,
  grid_cell,
  sensor,
  count(*)::integer as detections,
  round(avg(confidence)::numeric, 2) as mean_confidence,
  round(sum(frp_mw)::numeric, 2) as total_frp_mw
from fire_observations
group by 1, 2, 3;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on ingestion_runs, fire_observations, fire_activity_daily from anon;
    revoke all on sequence ingestion_runs_id_seq from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on ingestion_runs, fire_observations, fire_activity_daily from authenticated;
    revoke all on sequence ingestion_runs_id_seq from authenticated;
  end if;
end $$;

comment on table fire_observations is 'Canonical MODIS and VIIRS source records. Records are preserved; possible overlap is informational.';
comment on view fire_activity_daily is 'Shared UTC-day and grid-cell index with sensor statistics retained separately.';
