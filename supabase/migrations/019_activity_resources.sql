-- Bookable activities (pool tables, ping-pong tables, courts, lanes).
--
-- These were previously a settings-only UI whose rows lived in localStorage, so
-- they never reached the server and the bot could not see or book them. A guest
-- asking for "the pool table at 8" got an ordinary table reservation instead,
-- which consumed dining capacity while leaving the pool table free for everyone
-- else.
--
-- Modelled on dining_zones, but the capacity rule is different: a zone holds
-- many parties at once, whereas one activity resource is one physical thing and
-- is exclusively occupied for the length of a session. So there is no
-- max_concurrent_parties here; duration_minutes is the whole story.
create table if not exists public.activity_resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  slug text not null,
  -- pool | tennis | billiard | other — free text so new kinds do not need a
  -- migration; the UI offers a fixed list.
  type text not null default 'other',
  duration_minutes integer not null default 60 check (duration_minutes >= 15),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

create index if not exists activity_resources_business_id_idx
  on public.activity_resources (business_id, sort_order);

-- Which physical resource a reservation holds. Null for ordinary table bookings,
-- which keeps every existing appointment row valid and lets the whole
-- reservation lifecycle (cancel, reschedule, emails, CRM) work unchanged.
alter table public.appointments
  add column if not exists activity_id uuid references public.activity_resources (id) on delete set null;

-- Overlap checks scan a single resource's day.
create index if not exists appointments_activity_idx
  on public.appointments (activity_id, scheduled_at);

-- Mirrors dining_zones_owner_all in 011: without a policy every client-side read
-- from the settings page returns zero rows.
alter table public.activity_resources enable row level security;

drop policy if exists "activity_resources_owner_all" on public.activity_resources;
create policy "activity_resources_owner_all" on public.activity_resources
  for all to authenticated
  using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  )
  with check (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );
