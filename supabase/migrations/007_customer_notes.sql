-- Guest notes for CRM (owner-editable, synced across devices).
-- Optional cleanup for bot-generated names mistaken as guest names:
-- update public.customers set name = 'Guest' where name ilike '%reservation%' or name ilike '%placing%';

alter table public.customers add column if not exists notes text;
