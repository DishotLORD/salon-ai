-- Per-restaurant visual preference for the public chat widget.
alter table public.businesses
  add column if not exists widget_theme text not null default 'ice';

alter table public.businesses
  drop constraint if exists businesses_widget_theme_check;

alter table public.businesses
  add constraint businesses_widget_theme_check
  check (widget_theme in ('ice', 'ocean'));

comment on column public.businesses.widget_theme is
  'Public chat appearance: ice (light blue) or ocean (original dark navy).';
