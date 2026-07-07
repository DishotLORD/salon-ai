-- Staff roles & multi-user access.
-- Members (owner / manager / host) get RLS access to the business's data;
-- invites are claimed by email on first login via claim_business_invites().

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'host' check (role in ('owner', 'manager', 'host')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, email)
);

create index if not exists business_members_business_idx on public.business_members (business_id);
create index if not exists business_members_user_idx on public.business_members (user_id);

comment on table public.business_members is
  'Staff access: owner (full), manager (operations + settings), host (day-to-day dashboard)';

-- ─── Helper functions (security definer avoids RLS recursion) ────────────────

create or replace function public.accessible_business_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.businesses where user_id = auth.uid()
  union
  select business_id from public.business_members
   where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_business_admin(biz uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.businesses where id = biz and user_id = auth.uid())
      or exists (
        select 1 from public.business_members
         where business_id = biz
           and user_id = auth.uid()
           and status = 'active'
           and role in ('owner', 'manager')
      )
$$;

-- Claim pending invites that match the signed-in user's email.
create or replace function public.claim_business_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer;
  user_email text;
begin
  user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if user_email = '' or auth.uid() is null then
    return 0;
  end if;
  update public.business_members
     set user_id = auth.uid(), status = 'active', updated_at = now()
   where lower(email) = user_email
     and status = 'invited'
     and (user_id is null or user_id = auth.uid());
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

revoke all on function public.accessible_business_ids() from public;
revoke all on function public.is_business_admin(uuid) from public;
revoke all on function public.claim_business_invites() from public;
grant execute on function public.accessible_business_ids() to authenticated;
grant execute on function public.is_business_admin(uuid) to authenticated;
grant execute on function public.claim_business_invites() to authenticated;

-- ─── RLS on business_members ─────────────────────────────────────────────────

alter table public.business_members enable row level security;

drop policy if exists "members_select" on public.business_members;
create policy "members_select" on public.business_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_business_admin(business_id)
  );

drop policy if exists "members_insert_admin" on public.business_members;
create policy "members_insert_admin" on public.business_members
  for insert to authenticated
  with check (
    public.is_business_admin(business_id)
    and role in ('manager', 'host')
  );

drop policy if exists "members_update_admin" on public.business_members;
create policy "members_update_admin" on public.business_members
  for update to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id) and role in ('manager', 'host'));

drop policy if exists "members_delete_admin" on public.business_members;
create policy "members_delete_admin" on public.business_members
  for delete to authenticated
  using (public.is_business_admin(business_id));

-- ─── Widen core-table policies from owner-only to member access ──────────────

drop policy if exists "businesses_select_own" on public.businesses;
create policy "businesses_select_own" on public.businesses
  for select to authenticated
  using (user_id = auth.uid() or id in (select public.accessible_business_ids()));

-- updates stay owner/manager only
drop policy if exists "businesses_update_own" on public.businesses;
create policy "businesses_update_own" on public.businesses
  for update to authenticated
  using (user_id = auth.uid() or public.is_business_admin(id))
  with check (user_id = auth.uid() or public.is_business_admin(id));

drop policy if exists "services_owner_all" on public.services;
create policy "services_owner_all" on public.services
  for all to authenticated
  using (business_id in (select public.accessible_business_ids()))
  with check (business_id in (select public.accessible_business_ids()));

drop policy if exists "customers_owner_all" on public.customers;
create policy "customers_owner_all" on public.customers
  for all to authenticated
  using (business_id in (select public.accessible_business_ids()))
  with check (business_id in (select public.accessible_business_ids()));

drop policy if exists "conversations_owner_all" on public.conversations;
create policy "conversations_owner_all" on public.conversations
  for all to authenticated
  using (business_id in (select public.accessible_business_ids()))
  with check (business_id in (select public.accessible_business_ids()));

drop policy if exists "messages_owner_all" on public.messages;
create policy "messages_owner_all" on public.messages
  for all to authenticated
  using (
    conversation_id in (
      select c.id from public.conversations c
      where c.business_id in (select public.accessible_business_ids())
    )
  )
  with check (
    conversation_id in (
      select c.id from public.conversations c
      where c.business_id in (select public.accessible_business_ids())
    )
  );

drop policy if exists "appointments_owner_all" on public.appointments;
create policy "appointments_owner_all" on public.appointments
  for all to authenticated
  using (business_id in (select public.accessible_business_ids()))
  with check (business_id in (select public.accessible_business_ids()));

drop policy if exists "dining_zones_owner_all" on public.dining_zones;
create policy "dining_zones_owner_all" on public.dining_zones
  for all to authenticated
  using (business_id in (select public.accessible_business_ids()))
  with check (business_id in (select public.accessible_business_ids()));
