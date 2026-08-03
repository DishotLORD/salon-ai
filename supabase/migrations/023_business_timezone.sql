-- Per-business IANA timezone for reservation wall-clock interpretation.
-- appointments.scheduled_at stays timestamptz (UTC instants). Null timezone
-- means "use America/Edmonton" at runtime so existing Alberta venues are
-- unchanged without rewriting any appointment rows.

alter table public.businesses
  add column if not exists timezone text;

alter table public.businesses
  drop constraint if exists businesses_timezone_canadian;

alter table public.businesses
  add constraint businesses_timezone_canadian
  check (
    timezone is null
    or timezone in (
      'America/Vancouver',
      'America/Edmonton',
      'America/Regina',
      'America/Winnipeg',
      'America/Toronto',
      'America/Halifax',
      'America/St_Johns'
    )
  );

comment on column public.businesses.timezone is
  'IANA timezone for venue-local wall-clock (Canadian zones). Null → America/Edmonton at runtime; never rewrite scheduled_at when this changes.';
