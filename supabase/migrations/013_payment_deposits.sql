-- Stripe reservation deposits
alter table public.businesses
  add column if not exists payment_settings jsonb not null default '{
    "deposit_enabled": false,
    "deposit_per_guest": 0
  }'::jsonb;

alter table public.appointments
  add column if not exists deposit_status text not null default 'none'
    check (deposit_status in ('none', 'pending', 'paid', 'refunded')),
  add column if not exists deposit_amount_cents integer,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text;

create index if not exists appointments_stripe_session_idx
  on public.appointments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

comment on column public.businesses.payment_settings is
  'Stripe deposit prefs: deposit_enabled, deposit_per_guest (CAD per guest)';
comment on column public.appointments.deposit_status is
  'none | pending (checkout created) | paid | refunded';
