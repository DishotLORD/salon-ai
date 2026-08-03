-- Owner-confirmed operating hours. DB defaults alone must not count as
-- launch-ready: new businesses get NULL here until they explicitly Save hours.
-- Existing venues that already have seating or appointments are backfilled so
-- The Garage and other live restaurants stay operational without a rewrite.

alter table public.businesses
  add column if not exists operating_hours_confirmed_at timestamptz;

comment on column public.businesses.operating_hours_confirmed_at is
  'Set when the owner explicitly saves operating hours. Null means hours are not confirmed (UI/DB defaults do not count).';

update public.businesses b
set operating_hours_confirmed_at = coalesce(b.created_at, now())
where b.operating_hours_confirmed_at is null
  and (
    exists (select 1 from public.dining_zones z where z.business_id = b.id)
    or exists (select 1 from public.appointments a where a.business_id = b.id)
  );
