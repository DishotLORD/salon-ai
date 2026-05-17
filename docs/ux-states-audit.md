# Loading / error / empty states audit

**Date:** 2026-05-16

## Matrix

| Route | Loading | Error | Empty | Auth gate |
|-------|---------|-------|-------|-----------|
| `/dashboard` | SSR data | — | Activity empty copy | Server redirect |
| `/dashboard/chats` | Inbox skeleton | `inboxFetchError` banner | Empty inbox CTA | Layout redirect |
| `/dashboard/bookings` | Placeholder blocks | Inline alert | No reservations | Layout redirect |
| `/dashboard/crm` | Placeholder | `crmError` | No customers | Layout redirect |
| `/dashboard/settings` | "Loading…" | Form error | — | Layout redirect |
| `/widget` | "Loading conversation…" | AI error bubble | Welcome message | Needs `business_id` |
| `/auth/login` | Suspense null | Form error | — | — |
| `/onboarding` | "Loading…" | Form error | — | Client redirect |

## Gaps addressed

- Added `app/dashboard/error.tsx`, `app/dashboard/loading.tsx`
- Added `app/widget/error.tsx`
- Dashboard layout: server auth + onboarding redirect

## Remaining (P2)

- Shared skeleton component extraction
- Widget offline/retry UX
- CRM desktop table horizontal scroll on narrow viewports
- Bookings realtime (currently refresh-only)
