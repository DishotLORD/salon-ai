-- Row Level Security for OceanCore.
-- Apply after 001_initial_schema.sql. Service role (API routes) bypasses RLS.

alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.appointments enable row level security;

-- ─── Businesses ──────────────────────────────────────────────────────────────
drop policy if exists "businesses_select_own" on public.businesses;
create policy "businesses_select_own" on public.businesses
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "businesses_select_public_widget" on public.businesses;
create policy "businesses_select_public_widget" on public.businesses
  for select to anon
  using (true);

drop policy if exists "businesses_insert_own" on public.businesses;
create policy "businesses_insert_own" on public.businesses
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "businesses_update_own" on public.businesses;
create policy "businesses_update_own" on public.businesses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Services (menu) ─────────────────────────────────────────────────────────
drop policy if exists "services_owner_all" on public.services;
create policy "services_owner_all" on public.services
  for all to authenticated
  using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  )
  with check (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "services_select_anon" on public.services;
create policy "services_select_anon" on public.services
  for select to anon
  using (true);

-- ─── Customers ───────────────────────────────────────────────────────────────
drop policy if exists "customers_owner_all" on public.customers;
create policy "customers_owner_all" on public.customers
  for all to authenticated
  using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  )
  with check (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

-- ─── Conversations ───────────────────────────────────────────────────────────
drop policy if exists "conversations_owner_all" on public.conversations;
create policy "conversations_owner_all" on public.conversations
  for all to authenticated
  using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  )
  with check (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

-- ─── Messages ────────────────────────────────────────────────────────────────
drop policy if exists "messages_owner_all" on public.messages;
create policy "messages_owner_all" on public.messages
  for all to authenticated
  using (
    conversation_id in (
      select c.id from public.conversations c
      join public.businesses b on b.id = c.business_id
      where b.user_id = auth.uid()
    )
  )
  with check (
    conversation_id in (
      select c.id from public.conversations c
      join public.businesses b on b.id = c.business_id
      where b.user_id = auth.uid()
    )
  );

drop policy if exists "messages_select_by_conversation_anon" on public.messages;
create policy "messages_select_by_conversation_anon" on public.messages
  for select to anon
  using (conversation_id in (select id from public.conversations));

-- ─── Appointments (reservations) ─────────────────────────────────────────────
drop policy if exists "appointments_owner_all" on public.appointments;
create policy "appointments_owner_all" on public.appointments
  for all to authenticated
  using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  )
  with check (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );
