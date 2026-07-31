# OceanCore

An AI concierge for restaurants and bars. Guests chat with it on the venue's own
website; it answers questions from the venue's menu and hours, checks live
availability, and books, moves or cancels tables. Owners get a dashboard for
reservations, conversations, a guest CRM and analytics.

- **Marketing site** — `/`, plus `/privacy` and `/terms`
- **Embedded widget** — `/widget`, loaded into a restaurant's page by `public/widget.js`
- **Dashboard** — `/dashboard` (bookings, chats, CRM, analytics, settings)
- **Concierge** — `POST /api/chat`, the booking engine and its tools
- **Landing demo** — `POST /api/demo/concierge`, a sealed fictional venue

Stack: Next.js 16 (App Router, Turbopack), React 19, Supabase (Postgres, Auth,
Realtime), OpenAI, Stripe, Resend, Tailwind 4.

> Next 16 renamed Middleware to Proxy. The gate for every request lives in
> `proxy.ts` at the project root, not `middleware.ts`.

## Running it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Put the variables below in `.env.local`.

To see the embedded widget the way a guest does, drop this onto any local page —
`id` is the row id from the `businesses` table:

```html
<script src="http://localhost:3000/widget.js?id=YOUR_BUSINESS_ID" async></script>
```

## Environment variables

**Required — nothing works without these**

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server only — never expose it) |
| `OPENAI_API_KEY` | Powers the concierge |

**Strongly recommended in production**

| Variable | What happens without it |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Absolute links fall back to Vercel's own domain vars, then to `http://localhost:3000`. Set it on a custom domain, or deposit links and email buttons point at the wrong host. |
| `RESEND_API_KEY` | No email at all: no guest confirmations, no owner alerts, no waitlist offers. |
| `RESEND_FROM_EMAIL` | Falls back to Resend's sandbox sender, which only delivers to your own address. Verify a domain in Resend and set this before real guests book. |
| `STRIPE_SECRET_KEY` | Deposits are silently unavailable, and the concierge stops offering them. |
| `STRIPE_WEBHOOK_SECRET` | `/api/payments/webhook` returns 503, so a paid deposit never marks the booking as paid. |

**Optional**

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_BUSINESS_TIMEZONE` | IANA name (`America/Toronto`, `Europe/Kyiv`). Defaults to `America/Edmonton`. See *Timezone* below. |
| `OPENAI_CHAT_MODEL` | Concierge model. Code default is `gpt-4o-mini`, which slips on weekday arithmetic; `gpt-4o` follows the booking rules reliably. |
| `OPENAI_DEMO_MODEL` | Model for the landing-page demo only. Defaults to `gpt-4o-mini`. |
| `GEOAPIFY_API_KEY` | Address autocomplete in Settings → Restaurant. The field accepts typed addresses without it. |
| `NEXT_PUBLIC_MENU_PDF_MAX_MB` | Menu PDF upload cap, default 4 MB. Deliberately conservative: the hosting platform rejects an oversized request body before our code runs, which surfaces as an unreadable upload. Check the platform's own request-body limit before raising it. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting that survives deploys and spans serverless instances. Without them the limiter is per-instance and in memory — fine for one box, leaky across many. |
| `BOOKING_AVAILABILITY_DEBUG=1` | Logs the availability query against what the database actually holds. Noisy; for chasing "why is that slot missing". |

## Database

Migrations are plain SQL in `supabase/migrations/`, applied in filename order
through the Supabase dashboard's SQL editor. They are additive and safe to re-run.

Two are easy to miss and cause silent breakage:

- **`016_realtime_chat_tables.sql`** — puts `messages` and `conversations` in the
  realtime publication. Until it runs, a staff reply typed in the dashboard never
  reaches the guest's widget.
- **`020_widget_launcher_color.sql`** — the per-venue launcher colour. Settings
  shows a migration hint if it is missing.

The settings pages detect a missing migration and say which file to run, rather
than failing silently.

## Timezone

Reservation times are wall-clock times in the venue's timezone, stored as UTC.
The timezone is currently **one per deployment**, not one per business: set
`NEXT_PUBLIC_BUSINESS_TIMEZONE` at build time (it has to be `NEXT_PUBLIC_` so the
dashboard bundle and the server agree). A value that is not a real IANA name is
rejected at startup with a logged error and falls back to the default rather than
throwing on every request — `/api/health` reports which name actually took effect.

Serving venues in several timezones from one deployment is not supported yet.

## Deploying

Built for Vercel. `npm run build` must pass; there are no tests yet, so treat
`npx tsc --noEmit` and `npx eslint app components lib` as the gate.

After the first deploy:

1. Set the environment variables above in the Vercel project — including
   `OPENAI_CHAT_MODEL`, which is easy to set locally and forget in production.
2. Add the Stripe webhook endpoint at `https://your-domain/api/payments/webhook`,
   subscribed to `checkout.session.completed`, `checkout.session.expired` and
   `charge.refunded`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Point uptime monitoring at `/api/health`. It returns 503 when the database is
   unreachable or the model/service-role keys are missing, `degraded` when email,
   payments or the timezone are misconfigured, and reports region and commit.

`public/videos/`, `public/models/` and `public/whale2/` are excluded from the
deploy by `.vercelignore` — the login video is served from Supabase storage, and
the other two are unused. Do not reference them from code.

## Notes for whoever picks this up

- `/privacy` and `/terms` describe how the software actually behaves and list the
  real subprocessors, but they carry an explicit "not reviewed by counsel" note
  and no registered company name. Have a lawyer read them before the first paying
  customer.
- `components/ocean-landing-page.tsx` is dead — an earlier landing page,
  superseded by `app/page.tsx`.
- The landing demo must never be pointed at `/api/chat`. That route writes
  conversations, customers and appointments and sends mail; a public demo on it
  would write into a live restaurant's data.
