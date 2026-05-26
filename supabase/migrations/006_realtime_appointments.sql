-- Enable Supabase Realtime for appointments (run in SQL Editor if publication already exists).
-- Dashboard → Database → Publications → supabase_realtime should list public.appointments after this.

alter publication supabase_realtime add table public.appointments;
