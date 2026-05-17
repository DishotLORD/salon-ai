# Reservation flow reliability audit

**Date:** 2026-05-16  
**Product:** OceanCore (restaurant concierge)

## Flow map

| Path | Entry | Persistence | Auto-booking |
|------|-------|-------------|--------------|
| Widget guest | `app/widget/page.tsx` → `POST /api/chat` | API (service role) | `tryCreateReservationFromChat` |
| Dashboard inbox (AI) | `app/dashboard/chats/page.tsx` → `POST /api/chat` | Was broken (no `business_id`) → **fixed** | Same as widget when IDs passed |
| Dashboard inbox (human) | Takeover → direct `messages` insert | Client (assistant role) | N/A |
| Manual booking | `app/dashboard/bookings/page.tsx` | Client CRUD on `appointments` | N/A |

## Findings

### Critical (fixed in this pass)

| ID | Issue | Fix |
|----|-------|-----|
| R1 | Inbox called `/api/chat` without `business_id` / `conversation_id` → preview mode, no bookings | Pass IDs; align with widget single-writer path |
| R2 | Inbox inserted user + assistant in DB, API also inserted → duplicates when IDs fixed | Inbox uses API-only persistence for AI path (like widget) |
| R3 | Open `/api/chat` preview mode → cost abuse | Require `business_id`; optional `CHAT_PREVIEW_SECRET` for demos |

### High (document / monitor)

| ID | Issue | Notes |
|----|-------|-------|
| R4 | `parseScheduledAt` miss → `tonightAtSevenLocal()` fallback | Log `[booking]`; verify in manual QA |
| R5 | `service_name` encodes guest · party · table · notes | P2 schema migration |
| R6 | Owner “test as guest” without takeover sends `role: user` | Intentional simulate-guest; use takeover for real replies |

### Medium

| ID | Issue | Notes |
|----|-------|-------|
| R7 | Duplicate prevention only by `conversation_id` | OK for MVP |
| R8 | Wall-clock `scheduled_at` without TZ on business | P2: `business.timezone` column |

## Manual QA checklist

- [ ] Widget: full booking flow → row in `appointments`
- [ ] Widget: confirm without name → no booking, AI asks name
- [ ] Widget: second confirm same chat → no duplicate
- [ ] Takeover `human` → API returns `skipped`, no AI reply
- [ ] Inbox AI reply → booking + guest sync
- [ ] Bookings calendar: manual add/edit/delete
- [ ] “Tomorrow 7pm” / “tonight” date parsing

## Related code

- `app/api/chat/route.ts` — `BOOKING_FLOW_RULES`, `tryCreateReservationFromChat`
- `app/dashboard/bookings/page.tsx` — `parseReservation`
- `app/dashboard/chats/page.tsx` — `handleSend`
