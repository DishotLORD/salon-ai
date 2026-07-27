-- Per-restaurant launcher accent for the public chat widget FAB.
-- Null = fall back to the active widget theme's default launcher gradient.
alter table public.businesses
  add column if not exists widget_launcher_color text;

alter table public.businesses
  drop constraint if exists businesses_widget_launcher_color_check;

alter table public.businesses
  add constraint businesses_widget_launcher_color_check
  check (
    widget_launcher_color is null
    or widget_launcher_color ~* '^#[0-9a-f]{6}$'
  );

comment on column public.businesses.widget_launcher_color is
  'Hex color for the guest chat launcher button (e.g. #0ea5e9). Null uses the theme default.';
