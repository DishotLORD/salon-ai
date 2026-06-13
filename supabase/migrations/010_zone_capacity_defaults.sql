-- Zone capacity now represents concurrent guests (covers), not reservation count.
alter table public.dining_zones
  alter column max_concurrent_parties set default 150,
  alter column turnover_minutes set default 70;

comment on column public.dining_zones.max_concurrent_parties is
  'Maximum concurrent guests (covers) allowed in this zone.';
comment on column public.dining_zones.turnover_minutes is
  'Average stay duration in minutes used for slot capacity math.';

-- Legacy rows stored table/reservation counts (often 4–12); treat as covers minimum.
update public.dining_zones
set max_concurrent_parties = 150
where max_concurrent_parties < 20;
