# Vada Meet

Mobile-first, personality-first virtual speed dating for gay, bi and queer men, including trans men.

Private pilot: https://vada-meet.awakesage65.chatgpt.site

About: https://vada-meet.awakesage65.chatgpt.site/#/about

Host dashboard: https://vada-meet.awakesage65.chatgpt.site/#/host

## What is implemented

- LGBTQ visual identity and a dedicated About page.
- Supabase email/password authentication, email verification and password recovery.
- Profiles, mutual age preferences, interests and dating intentions.
- Event reservations with transaction-safe capacity limits and participant check-in.
- Host dashboard for event creation, starting rounds, ending events and reviewing reports.
- Deterministic pairing that respects mutual age preferences and blocks, favours shared interests, avoids repeat pairs and supports rest rounds.
- LiveKit rooms restricted to the two assigned participants, server-issued short-lived tokens, camera/microphone controls and icebreakers.
- Server-clock round timing, decision breaks, scheduled room removal, skip and block.
- Private yes/no decisions, mutual connections and stored messaging.

## Architecture

The Vite client calls `vada-api`, a Supabase Edge Function that verifies the signed-in user through Supabase Auth. Browser keys can read published event listings only. All personal tables have RLS enabled and their browser grants revoked; server-only RPCs perform atomic mutations. The service-role key never enters the frontend.

LiveKit credentials are loaded from Supabase Edge Function secrets or encrypted Supabase Vault. `vada-sweep` authenticates a server-only cron secret and closes expired/skipped/blocked rooms. A five-second pg_cron tick calls it only when cleanup is needed. Client transitions occur at the scheduled time; server room removal normally follows within the polling interval plus network latency. Monitor scheduler failures before running public events.

## Local development

Requires Node 24 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Copy `.env.example` to `.env` to use another backend. The checked-in Supabase URL and publishable key identify this project's backend and are intentionally public. Never add service-role keys, LiveKit secrets, passwords or personal participant data to GitHub.

## Hosting and deployment

- Frontend: static Vite build in `dist`, deployable to Sites, GitHub Pages, Cloudflare Pages or another static host.
- GitHub: `CT5Pride/VadaMeet`.
- Supabase project: `zccppmeltuvhdlmhqrnc`.
- Database history: `supabase/migrations`.
- Functions: `supabase/functions/vada-api` and `supabase/functions/vada-sweep`.

The included CI workflow runs the database/scheduler tests and produces the static website artifact on pushes and pull requests. The manual backend workflow deploys migrations and functions using GitHub repository secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and repository variable `SUPABASE_PROJECT_REF`. Those deployment credentials are not included in this repository.

The existing environment was deployed through the connected Supabase tools. Migration filenames are aligned with the verified remote migration history, so future CLI deployments start from the same baseline.

## Organiser access

The first organiser's designated email is stored privately as `VADA_HOST_EMAIL` in Vault. It is not in the source. Sign up, confirm the email and sign in; the backend grants that exact verified address host access. Other users cannot self-promote using profile metadata. Existing host grants are stored in `hosts`.

## Running an evening

1. Host signs in, completes their profile if participating, and creates an event.
2. Guests create verified accounts, complete profiles, reserve places and enter the event within 30 minutes of its start.
3. Guests keep the event page open. Host refreshes the guest list and starts the rounds.
4. A 15-second welcome countdown leads into the first date. Guests explicitly join video before camera/microphone access. Later assigned rounds connect automatically after that opt-in.
5. Guests privately decide yes/no. Mutual matches can continue messaging in Connections.
6. Host reviews reports and can end the event at any time.

## Video secret rotation

In Supabase's Vault UI, update `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` after rotating the key in LiveKit Cloud. Alternatively set those names under Edge Functions → Secrets; environment values take precedence over Vault. No frontend rebuild is needed. Rotate any key that was previously pasted into a chat.

## Verification and launch limits

Unit/integration tests exercise pairing across 2–40 participants, age/block constraints, odd attendance, timing boundaries, anonymous/authenticated database isolation, capacity, host-only start, private decisions, mutual matching and blocked messages. These tests run against an embedded PostgreSQL database, not a mocked SQL layer.

A real two-person audio/video call, account verification email delivery and host rehearsal still need to be exercised with invited people. Supabase Auth's Site URL is configured for the deployed frontend. Server-to-server LiveKit authentication was verified successfully through the deployed backend; the five-second cleanup job is active. For a public launch, configure a transactional email provider, publish the organiser's contact details, privacy notice/retention policy and service terms, and arrange event moderation. These operational steps are not represented as completed.

Supabase's security advisor has no warning/error findings. Informational “RLS enabled, no policy” findings on personal tables are intentional: browser table grants are revoked and no browser policy permits access. The only browser-readable table is the published event catalogue; verified server endpoints handle personal data.

## Latest additions
Homepage connection gallery with optional slideshow; saved contrast, larger-text and reduced-motion controls; organiser-only footer link; host aggregate analytics; optional Loops/Twilio reminders. See NOTIFICATIONS.md for account, domain and secret setup. Sending remains disabled pending provider configuration.
