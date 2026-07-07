-- Realtime for the chat stack. Only appointments was ever added (006), so:
--   * the widget never receives the owner's human-takeover replies,
--   * the inbox never sees live guest messages, conversation status changes,
--     or customer contact updates.
-- Run in Supabase Dashboard → SQL Editor. Idempotent.

do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.customers;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.waitlist_entries;
  exception when duplicate_object then null;
  end;
end $$;
