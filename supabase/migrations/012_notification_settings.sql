-- Notification preferences per business
alter table public.businesses
  add column if not exists notification_settings jsonb not null default '{
    "email_on_reservation": true,
    "sms_on_escalation": false,
    "digest_frequency": "daily"
  }'::jsonb;

comment on column public.businesses.notification_settings is
  'Owner notification prefs: email_on_reservation, sms_on_escalation, digest_frequency';
