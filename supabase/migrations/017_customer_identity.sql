-- Guest identity dedup: phone (E.164) is the primary identity key, email the
-- secondary one. This migration (1) normalizes stored emails, (2) merges
-- existing duplicate customers per business, re-pointing their appointments,
-- conversations, and waitlist entries to the oldest record, and (3) adds
-- partial unique indexes so the same phone/email can never create a second
-- profile for the same business again.
--
-- Run in Supabase Dashboard → SQL Editor.

-- ── 1. Normalize emails (app code lowercases; legacy rows may not be) ─────────
update public.customers
set email = lower(trim(email))
where email is not null and email <> lower(trim(email));

-- ── 2. Merge duplicates ───────────────────────────────────────────────────────
create or replace function public._merge_customer_duplicates(
  keeper uuid,
  dup_ids uuid[]
) returns void
language plpgsql
as $$
begin
  -- Backfill keeper's blank fields from the duplicates (best value wins).
  update public.customers k
  set
    name = case
      when coalesce(trim(k.name), '') = '' or k.name in ('Guest', 'Website visitor')
        then coalesce(
          (select d.name from public.customers d
            where d.id = any(dup_ids)
              and coalesce(trim(d.name), '') <> ''
              and d.name not in ('Guest', 'Website visitor')
            order by d.created_at desc limit 1),
          k.name)
      else k.name
    end,
    phone = case
      when coalesce(trim(k.phone), '') = ''
        then coalesce(
          (select d.phone from public.customers d
            where d.id = any(dup_ids) and coalesce(trim(d.phone), '') <> ''
            order by d.created_at desc limit 1),
          k.phone)
      else k.phone
    end,
    email = case
      when coalesce(trim(k.email), '') = ''
        then coalesce(
          (select d.email from public.customers d
            where d.id = any(dup_ids) and coalesce(trim(d.email), '') <> ''
            order by d.created_at desc limit 1),
          k.email)
      else k.email
    end,
    notes = case
      when coalesce(trim(k.notes), '') = ''
        then coalesce(
          (select d.notes from public.customers d
            where d.id = any(dup_ids) and coalesce(trim(d.notes), '') <> ''
            order by d.created_at desc limit 1),
          k.notes)
      else k.notes
    end
  where k.id = keeper;

  -- Re-point child records before deleting (FKs are ON DELETE SET NULL —
  -- skipping this would orphan bookings and chats).
  update public.appointments set customer_id = keeper where customer_id = any(dup_ids);
  update public.conversations set customer_id = keeper where customer_id = any(dup_ids);
  if to_regclass('public.waitlist_entries') is not null then
    update public.waitlist_entries set customer_id = keeper where customer_id = any(dup_ids);
  end if;

  delete from public.customers where id = any(dup_ids);

  -- Recompute visit stats from the merged bookings.
  update public.customers k
  set
    total_bookings = (
      select count(*) from public.appointments a
      where a.customer_id = keeper
        and lower(coalesce(a.status, '')) not in ('cancelled', 'canceled')
    ),
    last_visit = (
      select max(a.scheduled_at) from public.appointments a
      where a.customer_id = keeper
    )
  where k.id = keeper;
end;
$$;

-- Pass 1: merge by phone.
do $$
declare dup record;
begin
  for dup in
    select business_id, phone, array_agg(id order by created_at asc) as ids
    from public.customers
    where coalesce(trim(phone), '') <> ''
    group by business_id, phone
    having count(*) > 1
  loop
    perform public._merge_customer_duplicates(dup.ids[1], dup.ids[2:]);
  end loop;
end $$;

-- Pass 2: merge by email (after phone merge so groups are already collapsed).
do $$
declare dup record;
begin
  for dup in
    select business_id, lower(email) as email_key, array_agg(id order by created_at asc) as ids
    from public.customers
    where coalesce(trim(email), '') <> ''
    group by business_id, lower(email)
    having count(*) > 1
  loop
    perform public._merge_customer_duplicates(dup.ids[1], dup.ids[2:]);
  end loop;
end $$;

drop function public._merge_customer_duplicates(uuid, uuid[]);

-- ── 3. Prevent future duplicates ──────────────────────────────────────────────
-- Placeholder rows use '' for phone/email and stay exempt (partial indexes).
create unique index if not exists customers_business_phone_key
  on public.customers (business_id, phone)
  where coalesce(trim(phone), '') <> '';

create unique index if not exists customers_business_email_key
  on public.customers (business_id, lower(email))
  where coalesce(trim(email), '') <> '';
