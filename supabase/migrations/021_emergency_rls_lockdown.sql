-- EMERGENCY: remove unrestricted public RLS policies found on the live database.
--
-- Seven policies are dropped, from two different origins.
--
-- Six of them exist in production but appear in no migration in this repository
-- — they were created out of band (Supabase dashboard / early prototyping) and
-- were never reviewed. Each one grants the `public` role, which includes `anon`,
-- unrestricted access to a table holding guest personal data or reservations.
-- NEXT_PUBLIC_SUPABASE_ANON_KEY ships in every page bundle, so "anon" means
-- "anyone on the internet".
--
-- The seventh, messages_select_by_conversation_anon, is different: it IS in this
-- repository (002_rls_policies.sql) and is dropped here deliberately. Its own
-- condition is only safe while nothing else grants anon access to
-- public.conversations — a safety that this very migration is what establishes.
-- Leaving it in place would mean a policy whose security depends on the absence
-- of another policy, so anyone later re-adding anon reads on conversations would
-- silently reopen every guest transcript. Removed rather than left load-bearing.
--
-- What each dropped policy allowed:
--   appointments_all               every reservation of every restaurant, and
--                                  the ability to modify or delete them
--   businesses_select              every restaurant's email, phone, address,
--                                  system_prompt and menu_pdf_text
--   Allow all for conversations    every guest conversation — and, critically,
--                                  ENUMERATION of conversation ids
--   conversations_all              same, duplicated
--   customers_all                  every guest's name, phone, email and notes
--                                  (which hold allergies), writable
--   Allow all for messages         every message of every conversation
--   messages_select_by_conversation_anon
--                                  anon reads of messages for any conversation
--                                  the anon role can see (see note above)
--
-- KNOWN CONSEQUENCE for the guest widget: dropping the two message policies ends
-- anonymous reads of public.messages, so app/widget/page.tsx loses transcript
-- restore after a reload and loses realtime delivery of the owner's takeover
-- replies. Chatting and booking are unaffected — those run through the service
-- role in /api/chat. Both features need to come back through a server endpoint
-- authorized by conversation_id.
--
-- Deliberately NOT dropped here — correctly scoped policies that the dashboard
-- depends on, all of which resolve access through accessible_business_ids()
-- (migration 014):
--   appointments_owner_all, conversations_owner_all, customers_owner_all,
--   messages_owner_all, businesses_select_own, businesses_update_own,
--   businesses_insert_own, services_owner_all, dining_zones_owner_all,
--   waitlist_members_all, activity_resources_owner_all, members_*
--
-- Two further permissive anon policies from 002_rls_policies.sql are NOT touched
-- by this migration and are being reviewed separately — see the accompanying
-- report:
--   businesses_select_public_widget  `using (true)` for anon on businesses. If it
--                                    is present in production, dropping
--                                    "businesses_select" above does NOT close
--                                    that table — review this first.
--   services_select_anon             `using (true)` for anon on services. No
--                                    client reads it; the menu reaches the model
--                                    server-side.
--
-- BEFORE APPLYING: capture the current definitions, because DROP POLICY is not
-- reversible without them:
--   select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
--   from pg_policies where schemaname = 'public' order by tablename, policyname;

begin;

drop policy if exists "appointments_all"
  on public.appointments;

drop policy if exists "businesses_select"
  on public.businesses;

drop policy if exists "Allow all for conversations"
  on public.conversations;

drop policy if exists "conversations_all"
  on public.conversations;

drop policy if exists "customers_all"
  on public.customers;

drop policy if exists "Allow all for messages"
  on public.messages;

drop policy if exists "messages_select_by_conversation_anon"
  on public.messages;

commit;
