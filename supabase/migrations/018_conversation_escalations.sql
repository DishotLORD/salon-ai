-- Escalation categories already alerted for a conversation, so the concierge
-- never emails the owner twice about the same issue across chat turns.
-- (The in-request dedupe only covers tool calls within a single request.)

alter table public.conversations
  add column if not exists escalated_categories text[] not null default '{}';
