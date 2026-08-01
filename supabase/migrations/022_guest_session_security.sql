-- C-1: guest session security.
--
-- Two problems this closes, both confirmed on the live product.
--
-- 1. IDENTITY TAKEOVER. Typing a phone number or email was treated as proof of
--    identity: the concierge looked the contact up in `customers`, injected that
--    guest's name, phone, email, visit history and allergies into its own system
--    prompt, and let the caller read, move or cancel that guest's reservations.
--    A live test showed the crossover in the other direction too — a guest who
--    typed "RoNIN NARRRR" was booked as a different, pre-existing customer.
--
-- 2. UNAUTHENTICATED CONVERSATION RESUME. `conversation_id` alone re-opened a
--    conversation. Until migration 021 the anon role could also enumerate
--    `public.conversations`, so those ids were not even secret.
--
-- The fix has two halves.
--
-- GUEST SESSION TOKEN. Every new conversation now mints a cryptographically
-- random token. The database stores only its SHA-256 hash, so a leaked backup or
-- a SELECT over `conversations` yields nothing that can resume a session. The
-- plaintext is returned to the widget exactly once, at creation. Resuming a
-- conversation — or reading its messages or bookings — requires presenting it.
-- Conversations created before this migration have no hash and therefore FAIL
-- CLOSED: they cannot be resumed, and the widget starts a fresh conversation.
--
-- RESERVATION CONTACT SNAPSHOT. A reservation now carries the name, phone and
-- email the guest gave *in that conversation*, instead of pointing at a CRM
-- identity resolved by matching an unverified contact. This is what lets the
-- application stop merging customer records on a typed phone number: the booking
-- keeps the details the restaurant needs to honour it, and the confirmation
-- email is addressed from this row and never from a looked-up customer.
-- `waitlist_entries` (migration 015) already stores contact this way; this brings
-- `appointments` in line.
--
-- Both changes are additive and nullable. Existing rows stay valid, and readers
-- fall back to the previous behaviour when the columns are null.

begin;

-- ─── Reservation contact snapshot ───────────────────────────────────────────
-- Guest-supplied, UNVERIFIED. Never promote these into `customers` and never use
-- them to match an existing guest — that is the takeover this migration closes.
alter table public.appointments
  add column if not exists guest_name text,
  add column if not exists guest_phone text,
  add column if not exists guest_email text;

comment on column public.appointments.guest_name is
  'Name given in the booking conversation. Unverified; display/contact only.';
comment on column public.appointments.guest_phone is
  'Phone given in the booking conversation. Unverified; never used to match customers.';
comment on column public.appointments.guest_email is
  'Email given in the booking conversation. Confirmation is sent here, never to a looked-up customer.';

-- ─── Guest session token ────────────────────────────────────────────────────
alter table public.conversations
  add column if not exists guest_access_token_hash text,
  add column if not exists guest_access_expires_at timestamptz;

comment on column public.conversations.guest_access_token_hash is
  'SHA-256 (hex) of the guest session token. Plaintext is returned to the widget once, at creation, and never stored.';
comment on column public.conversations.guest_access_expires_at is
  'When the guest session stops being resumable. Enforced server-side; a null hash or a past expiry fails closed.';

-- Resume validates (id, business_id, hash) together, so the lookup is covered.
create index if not exists conversations_guest_session_idx
  on public.conversations (id, guest_access_token_hash)
  where guest_access_token_hash is not null;

commit;

-- ROLLBACK (only if the application is rolled back first — the running code
-- requires a token to resume a conversation):
--   alter table public.conversations
--     drop column if exists guest_access_token_hash,
--     drop column if exists guest_access_expires_at;
--   alter table public.appointments
--     drop column if exists guest_name,
--     drop column if exists guest_phone,
--     drop column if exists guest_email;
