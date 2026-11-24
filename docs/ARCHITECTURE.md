# Architecture — StatusPulse

## System context

```
Browser (public)                     Browser (admin)
      │                                    │
      │ HTTPS (or HTTP on 8106)            │ session cookie + CSRF header
      ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Node.js 24 process — Hono app (src/server/app.ts)           │
│                                                             │
│  /api/public/*   /api/auth/*   /api/admin/*    static SPA   │
│  public read     login/demo    authenticated   dist/web      │
│                  logout-all                                  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Scheduler (in-process, 1s tick)                       │  │
│  │  due monitors → retries → runMonitorCheck              │  │
│  │  → store result → state transition → incident/notify  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Demo timer (hourly reset) + activity audit log             │
│  Check engines: HTTP(S) | TCP | DNS | TLS                   │
│  Security: SSRF guard (resolve + pin), auth, CSRF, CSP      │
└───────────────┬───────────────────────────┬─────────────────┘
                │                           │
        SQLite (data/statuspulse.db)   data/notifications.log
```

One process, one assigned port (8106), one SQLite file. There is no queue, Redis, worker process or separate frontend server.

## Source layout

```
src/
  shared/
    types.ts              Shared DTO and domain types
    i18n/{ar,en}.json     Flat translation dictionaries (parity tested)
  server/
    index.ts              Startup, scheduler lifecycle, graceful shutdown
    app.ts                Hono wiring, security headers, static SPA serving
    config.ts             Environment configuration
    db/{index,schema}.ts  SQLite connection, pragmas, idempotent schema
    lib/
      ip.ts               IPv4/IPv6 parsing and range classification
      ssrf.ts             Resolution, validation, pinning, blocked errors
      pinned-lookup.ts    Node lookup adapter (all:true and single modes)
      password.ts         scrypt hashing, constant-time compare
      sessions.ts         Sessions, cookies, login throttling, revoke-all
      rate-limit.ts       In-process sliding-window limiter
      logger.ts           JSON line logger
    checks/
      types.ts            Probe interfaces + injectable context
      http-probe.ts       SSRF-guarded HTTP client with redirects
      tcp-probe.ts        Pinned TCP connect
      dns-probe.ts        Resolver queries A/AAAA/CNAME/TXT/MX
      tls-probe.ts        Certificate inspection + trust result
      engine.ts           Verdicts per monitor type
    services/
      monitors.ts         CRUD + row mapping + normalisation
      uptime.ts           Weighted uptime and daily buckets
      incidents.ts        Lifecycle, updates, resolution
      maintenance.ts      Windows and active-state math
      notifications.ts    Notification centre + JSONL log
      scheduler.ts        Tick loop, retries, incidents, webhook
      webhook.ts          Optional HMAC-signed, SSRF-guarded delivery
      users.ts            Admin lookup/upsert
      settings.ts         Key/value settings
      demo.ts             Labelled synthetic dataset + reset
      audit.ts            Local activity/audit trail
    api/
      middleware.ts       Auth, CSRF, Origin, headers, helpers
      schemas.ts          Zod validation (messages are i18n keys)
      auth-routes.ts      Login/demo/me/logout/logout-all
      admin-routes.ts     Admin JSON API + audit endpoint
      public-routes.ts    Public status/incidents/config/health
    cli/
      create-admin.ts     Local admin creation
      demo-reset.ts       Rebuild the demo dataset
      seed-demo.ts        Backwards-compatible demo alias
  web/
    index.html            Vite entry (lang=ar dir=rtl by default)
    main.tsx / App.tsx    Providers + path routing + guards
    styles.css            Tokens, font faces, primitives
    lib/                  api, i18n, auth, router, format, status, theme, time
    components/           Logo, icons, layout, charts, bars, modal, toasts
    pages/                Public status, login, admin pages
    public/               favicon, robots.txt, Readex Pro + JetBrains Mono + OFL
tests/                    Vitest unit and integration tests
scripts/                  Headless Chrome screenshot capture (CDP, no dependency)
docs/                     Architecture, decisions, brand, security review
```

## Request pipeline

1. Hono receives the request.
2. Security headers middleware adds CSP (no `unsafe-inline`), HSTS when HTTPS, nosniff, frame deny, referrer, permissions, COOP/CORP and `no-store` for `/api/*`.
3. Public API requests pass a 240/min per-IP limiter. API requests then pass a 256 KiB body limit and debug-level request logging.
4. Route-specific middleware:
   - `/api/auth/login` — Origin check, Zod validation, throttle check, dummy-hash timing equalisation, scrypt verification, session regeneration, cookie, audit entry.
   - `/api/auth/demo` — 404 when `DEMO_MODE=false`; Origin check; per-IP limiter; ensures the demo dataset; session + audit entry.
   - `/api/auth/me` — requires a session.
   - `/api/auth/logout` and `/logout-all` — session + CSRF.
   - `/api/admin/*` — session + CSRF + Origin check on state changes; writes an audit row for sensitive actions.
   - `/api/public/*` — anonymous, read-only, rate limited; `/config` exposes only demo flags and product name.
5. Unknown `/api/*` paths return a JSON 404.
6. Static assets are served from `dist/web` (`/assets`, `/fonts`, `/favicon.svg`, `/robots.txt`) with immutable caching for hashed assets and fonts.
7. Any other GET returns the SPA shell (`index.html`) so client paths such as `/admin/monitors/1` work. If the frontend has not been built, a 503 page explains how to build it.

## Data model

SQLite, WAL mode, foreign keys on. Timestamps are epoch milliseconds. JSON columns hold check detail/params.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | Admin accounts | `email` unique, `password_hash`, `role='admin'` |
| `sessions` | Server-side sessions | random `id`, `csrf_token`, `expires_at`, IP/UA |
| `login_attempts` | Throttling ledger | `email`, `ip`, `attempted_at`, `success` |
| `password_resets` | Single-use reset tokens | `token_hash`, `expires_at`, `used_at` |
| `monitors` | Check definitions and last state | `type`, target fields, rules, interval/timeout/retries, `demo` flag, public name/group (ar/en), `current_state`, `last_checked_at` |
| `check_results` | Immutable check history | `state`, `status_code`, `latency_ms`, `error`, `detail` |
| `incidents` | Incident lifecycle | `status`, `severity`, `started_at`, `resolved_at`, `is_automatic` |
| `incident_updates` | Timeline | message or translation key + params, status, automatic flag |
| `maintenance_windows` | Planned maintenance | `title` plus optional `title_ar`/`title_en`, `starts_at`, `ends_at`, `monitor_id` null = all |
| `settings` | Key/value configuration | site identity, private targets, webhook |
| `notifications` | On-screen notification centre | level, `message_key`, params, read flag |
| `audit_log` | Local activity trail | `user_email`, `action`, entity, summary, IP, time |
| `schema_meta` | Schema version | version string |

Indexes exist for session expiry, login attempts, monitor due queries, results by monitor/time, incident status/monitor, incident updates, maintenance time, notification time and audit time. `monitors.demo` is a schema-2 additive column; `migrate()` adds it to older databases. Demo monitors are excluded from scheduler due checks and manual live checks.

## Check pipeline

```
Scheduler.tick(now)
  └─ enabled monitors where last_checked_at + interval*1000 <= now
      └─ executeMonitor(monitor)
          ├─ settings.allowPrivate && monitor.allowPrivate → allowPrivate
          ├─ up to retries+1 attempts, stop early on "up"
          ├─ runMonitorCheck(monitor, { allowPrivate, probes })
          │    ├─ http → pinned request → status/keyword/latency verdict
          │    ├─ tcp  → pinned connect → success/threshold
          │    ├─ dns  → resolver → value match
          │    └─ ssl  → pinned TLS → trust/expiry/threshold
          ├─ INSERT check_results
          ├─ UPDATE monitors state + consecutive failures
          ├─ if maintenance: no incident, log "suppressed" notification
          ├─ if down/degraded and no open incident: open + notify (+ webhook)
          └─ if up and an incident is open: resolve + notify (+ webhook)
```

Probes are dependency-injected so network can be mocked in tests. The default probes are the only code paths that touch the network.

### HTTP engine details

- Only `http:`/`https:`; credentials rejected.
- Each hop resolves and pins; up to 5 redirects; `303` switches to GET; loops rejected.
- `Host` is preserved; `Accept-Encoding: identity` keeps bodies readable for keyword checks.
- Response body is capped at 256 KiB (truncation flagged in detail).
- Latency is measured across the whole redirect chain.
- Verdict order: status mismatch → down; keyword mismatch → down; latency threshold → degraded; otherwise up.
- Keyword matching is case-insensitive.

### TLS engine details

- First handshake with `rejectUnauthorized: true` to obtain the real trust result.
- If it fails, a second inspection handshake with `rejectUnauthorized: false` reads certificate metadata so expiry/issuer remain visible; the check is down.
- Expired ⇒ down; within `sslWarnDays` ⇒ degraded; otherwise up. Latency threshold can also degrade.

## SSRF guard

1. Parse URL; reject non-http(s), credentials, malformed hosts.
2. Normalise host (brackets, trailing dot, zone ID).
3. If literal IP → classify directly.
4. Otherwise resolve all addresses once, classify each, choose the first allowed one.
5. Return `{ hostname, address, family }`; the probe uses a custom `lookup` that only returns that address.
6. Redirects repeat steps 1–5.

Classification distinguishes public, private, loopback, link-local, CGNAT, metadata, unspecified, multicast, reserved, documentation, benchmark and unique-local. `metadata`, `unspecified`, `multicast`, `reserved` and `invalid` are never allowed, even with private targets enabled. DNS monitors do not connect to the target; they only query the resolver.

## Incident state machine

| Current | New result | Maintenance? | Effect |
| --- | --- | --- | --- |
| no incident | up | any | no change |
| no incident | down/degraded | no | open incident (`investigating`, automatic, severity major/minor) + notification |
| no incident | down/degraded | yes | no incident; log suppressed notification |
| open incident | down/degraded | no | no duplicate incident |
| open incident | up | no | resolve incident + automatic resolved update + notification |
| open incident | up | yes | remain open (recovery during maintenance still resolves) |
| resolved | any | any | no automatic reopening; a new incident opens on a later failure |

Manual updates can change the status at any time. Setting `resolved` stamps `resolved_at`; setting a non-resolved status clears it (reopen). Automatic resolution is idempotent.

Severity: `down` ⇒ major, `degraded` ⇒ minor.

## Uptime math

- Each check contributes a weight: `up=1`, `degraded=0.5`, `down=0`.
- Uptime = weighted sum / number of checks × 100, rounded to two decimals.
- Results inside an active maintenance window (global or matching monitor) are excluded from uptime aggregates.
- 24h/7d/30d windows use `checked_at` bounds and SQL aggregates.
- 90-day bars group results by **UTC** calendar day (`date(checked_at/1000,'unixepoch')`), returning `null` for days without data. Missing days are rendered neutral, not as downtime.
- The public page’s 90-day percentage is the average of non-null daily values.

## Maintenance semantics

- Active when `starts_at <= t < ends_at` (half-open, so adjacent windows do not overlap).
- `monitor_id NULL` applies to every component; otherwise only to that monitor.
- Checks continue during maintenance for history, but new incidents are suppressed and the public state becomes `maintenance`.
- If a monitor recovers during maintenance, an existing open incident is resolved normally.

## Authentication and authorization

- scrypt-hashed passwords; no plaintext or default account. Password minimum 12 characters for CLI-created operators.
- Sessions stored in SQLite; cookie `sp_session` (HttpOnly, SameSite=Lax, Secure optional).
- Session regeneration on login; logout deletes the row; logout-all deletes every row for the operator.
- Login throttling by email or IP; 5 failures per 15 minutes. Demo entry has a separate 15/10 min per-IP limiter.
- CSRF token stored with the session and required in `X-CSRF-Token` for unsafe methods; Origin checked on unsafe requests and on login/demo session creation.
- Demo visitors are blocked from changing private-target or webhook settings.
- Every admin route is behind `requireAuth`; there is no public write endpoint.

## API surface

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/public/status` | none | Full public status payload |
| `GET /api/public/incidents` | none | Public incidents (disabled page ⇒ empty) |
| `GET /api/public/config` | none | Demo mode, reset interval, product name |
| `GET /api/public/healthz` | none | Liveness |
| `POST /api/auth/login` | none + Origin | Create password session |
| `POST /api/auth/demo` | none + Origin | Guest session (404 when demo is off) |
| `POST /api/auth/password/request` | none + Origin, rate limited | Generic reset request; writes a local mail preview |
| `POST /api/auth/password/confirm` | none + Origin | Consume a single-use reset token and revoke sessions |
| `GET /api/auth/me` | session | Current user + CSRF token |
| `POST /api/auth/logout` | session + CSRF | Destroy current session |
| `POST /api/auth/logout-all` | session + CSRF | Revoke every session for the operator |
| `GET /api/admin/summary` | session | Dashboard counters |
| `GET/POST /api/admin/monitors` | session (+CSRF write) | List/create |
| `GET/PUT/DELETE /api/admin/monitors/:id` | session (+CSRF write) | Detail/update/delete |
| `GET /api/admin/monitors/:id/results?range=24h\|7d\|30d` | session | Chart/result data |
| `POST /api/admin/monitors/:id/check` | session + CSRF | Immediate check (409 for demo components) |
| `GET /api/admin/incidents?status=&limit=` | session | Incident list |
| `GET /api/admin/incidents/:id` | session | Incident + monitor |
| `POST /api/admin/incidents/:id/updates` | session + CSRF | Manual update/resolve |
| `GET/POST /api/admin/maintenance` | session (+CSRF write) | List/schedule |
| `DELETE /api/admin/maintenance/:id` | session + CSRF | Delete window |
| `GET/PUT /api/admin/settings` | session (+CSRF write) | Configuration |
| `POST /api/admin/webhook/test` | session + CSRF | Test webhook when enabled |
| `GET /api/admin/notifications` | session | Notification centre |
| `POST /api/admin/notifications/read-all` | session + CSRF | Mark read |
| `GET /api/admin/audit?limit=` | session | Local activity trail |

## Frontend

- **Routing:** a small History-API router (`lib/router.tsx`); no router dependency. `App.tsx` matches admin paths and guards them; an unauthenticated admin visit redirects to `/login`.
- **State:** React context for i18n, toasts and auth; page-local state and `useEffect` fetching.
- **API client:** `lib/api.ts` injects the CSRF token and dispatches `sp:unauthorized` on 401, which clears the session and returns the user to login.
- **i18n:** Arabic default, English switch, `localStorage` persistence, `?lang=` for screenshots/tests, `document.documentElement.lang/dir` updated in an effect. Flat key dictionaries imported by both frontend and tests. Numeric dates use an ISO-like `YYYY-MM-DD HH:mm` format to avoid bidi ambiguity; relative time uses `Intl`.
- **Design system:** CSS-variable token layer in `styles.css` and Tailwind semantic colours (`bg`, `panel`, `line`, `ink`, `accent`, `up`, `degraded`, `down`, `maint`). Dark NOC console (default), light admin theme, calm light public shell, dark login console. Readex Pro and JetBrains Mono, both self-hosted OFL. Original bracket/pulse logo. Logical CSS properties (`ms/me/ps/pe/start/end`) so RTL/LTR share one layout. See `docs/BRAND.md`.
- **Charts:** hand-written SVG latency line/area chart and 90 one-day bars, with tooltips and accessible labels; no chart library or CDN.
- **Public page:** the `/` HTML embeds the current public status as JSON so the first paint has data; it then polls `/api/public/status` every 30 seconds. It renders the overall strip, customer-facing component names with technical ids as secondary mono text, bars, maintenance, active incidents and history. Demo mode adds only a tiny footer note.
- **Legal and help:** `/about`, `/help`, `/privacy`, `/terms` and `/changelog` use the same quiet public shell, footer links and language switch.
- **Demo UI:** login shows a real status-board preview fetched from the public API and a one-click guest button that calls `/api/auth/demo`; the arbiter is the public `/api/public/config` flag.
- **Resilience:** loading skeletons, empty states, error retry buttons, disabled submit states, toast feedback and per-field validation messages translated from server keys.

## Static serving and CSP

- The server serves only known static prefixes and falls back to the SPA shell for client routes.
- CSP is self-only; scripts, styles and fonts are external files from the Vite build. `style-src 'self'` has no `unsafe-inline`; `connect-src 'self'` allows API polling. HSTS is added only for HTTPS deployments.
- Vite’s built-in esbuild transform compiles JSX with the automatic runtime. The React fast-refresh Babel plugin is deliberately not used (no Vite dev server and it would add a CC-BY data dependency).
- Screenshots are captured with headless Chrome via the DevTools Protocol (`scripts/capture-screenshots.mjs`); no browser automation dependency was added.

## Testing architecture

- Probes are injected, so engine tests never touch the network.
- Services are tested against real in-memory SQLite (`:memory:`) with the production schema.
- API tests use `app.request()` with real sessions, CSRF tokens and cookies.
- The SSRF unit tests drive the resolver directly; the live smoke test exercises the real network and the real guard.
- i18n tests enforce key parity, placeholders, dynamic key families and source usage; a font check verifies the two self-hosted families and OFL files.
- Security tests assert the strict CSP, HSTS, cross-origin rejection, audit entries, session revocation and demo restrictions.
- Demo tests cover the kill switch, guest session, seeded counts, reset idempotence, throttling and security-setting rejection.

## Operations

- Database: `data/statuspulse.db` (WAL/SHM files alongside), git-ignored.
- Notification log: `data/notifications.log`, JSONL, git-ignored.
- Mail preview log: `data/mail.log`, JSONL, git-ignored. This is the demo
  substitute for email and contains one-time reset links; treat it as sensitive.
- Retention: results older than 180 days, notifications older than 90 days, expired sessions, old login attempts and audit rows older than 180 days are pruned by the scheduler.
- Demo dataset: `npm run demo:reset`; server timer resets it every `DEMO_RESET_MINUTES` (default 60) when `DEMO_MODE=true`.
- Graceful shutdown clears the demo timer, scheduler, HTTP server and DB on SIGINT/SIGTERM.
- Logs are JSON lines to stdout/stderr; no log rotation is provided by the app.
- The assigned port is 8106; do not start a second dev server.
