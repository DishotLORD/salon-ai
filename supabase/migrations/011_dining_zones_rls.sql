-- dining_zones was created in 009 without RLS policies. With RLS enabled and no
-- policy, every client-side read (bookings page, settings, CRM drawer) returns
-- zero rows, so the dashboard cannot resolve zone names. Owner gets full access,
-- mirroring appointments_owner_all in 002.
alter table public.dining_zones enable row level security;

drop policy if exists "dining_zones_owner_all" on public.dining_zones;
create policy "dining_zones_owner_all" on public.dining_zones
  for all to authenticated
  using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  )
  with check (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );
