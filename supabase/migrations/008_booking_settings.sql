-- Phase A: booking engine settings + reservation duration
alter table public.businesses
  add column if not exists booking_settings jsonb not null default '{
    "default_duration_minutes": 90,
    "max_concurrent_reservations": 12,
    "slot_interval_minutes": 15
  }'::jsonb;

alter table public.appointments
  add column if not exists duration_minutes integer;

comment on column public.businesses.booking_settings is 'default_duration_minutes, max_concurrent_reservations, slot_interval_minutes';
comment on column public.appointments.duration_minutes is 'Table turn length; null uses business default';
