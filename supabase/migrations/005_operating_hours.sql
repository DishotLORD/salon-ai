-- Operating hours per day (Mon–Sun) for each business
alter table public.businesses
  add column if not exists operating_hours jsonb not null default '{
    "mon": {"open": "17:00", "close": "22:30", "closed": false},
    "tue": {"open": "17:00", "close": "22:30", "closed": false},
    "wed": {"open": "17:00", "close": "22:30", "closed": false},
    "thu": {"open": "17:00", "close": "23:00", "closed": false},
    "fri": {"open": "17:00", "close": "23:30", "closed": false},
    "sat": {"open": "11:30", "close": "23:30", "closed": false},
    "sun": {"open": "11:30", "close": "21:30", "closed": false}
  }'::jsonb;
