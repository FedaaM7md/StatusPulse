# Testing — StatusPulse

**Test date:** 2026-11-24
**Environment:** Windows (win32), Node.js v24.12.0, npm 11.6.2
**Assigned port:** 8106 (server stopped after verification)

All results below are from commands actually executed. No test was skipped,
deleted or weakened.

## Automated tests

```powershell
npm test
```

Final output:

```text
 RUN  v5.1.1 statuspulse

 Test Files  16 passed (16)
      Tests  181 passed (181)
   Duration  ~10s
```

### Suite coverage

| File | Coverage |
| --- | --- |
| `tests/ip.test.ts` | IPv4/IPv6 parsing and every blocked range |
| `tests/ssrf.test.ts` | Pinned resolution, metadata hard block, DNS rebinding defence, URL validation |
| `tests/http-engine.test.ts` | HTTP status, keyword, latency and error verdicts |
| `tests/checks.test.ts` | TCP, DNS and TLS verdicts; private-target double opt-in |
| `tests/uptime.test.ts` | Weighted uptime, UTC daily buckets, maintenance exclusion |
| `tests/maintenance.test.ts` | Half-open windows, scope, persistence |
| `tests/incidents.test.ts` | Auto-open, manual update, resolve/reopen, filters |
| `tests/scheduler.test.ts` | Due checks, retries, incidents, maintenance suppression, disabled monitors |
| `tests/auth.test.ts` | scrypt, login, throttle, session regeneration, logout, CSRF, 401/403 |
| `tests/password-reset.test.ts` | Single-use tokens, expiry, weak password rejection, session revocation, generic HTTP response, old-password rejection |
| `tests/security.test.ts` | Strict CSP/headers, HSTS, no-store, cross-origin session rejection, audit trail, logout-all, rate limiter |
| `tests/demo.test.ts` | Demo kill switch, one-click guest session, seeded data, reset, idempotence, rate limit, security-setting rejection |
| `tests/monitors-api.test.ts` | Monitor CRUD, validation, type normalisation, 404/401/403, CSV export with formula-injection safety |
| `tests/public-api.test.ts` | Public groups, uptime, 90-day bars, incidents, maintenance, leaks |
| `tests/i18n.test.ts` | Arabic/English key parity, placeholders, usage, self-hosted fonts, no CDN |
| `tests/notifications-webhook.test.ts` | Notification centre, JSONL log, webhook disabled/SSRF, secret masking |

New release 1.1 coverage: strict CSP without `unsafe-inline`, HSTS, cross-origin
session creation rejection, activity log, all-session revocation, demo 404 when
disabled, demo rate limiting, demo reset/idempotence, and demo restrictions on
security settings.

## Type-check

```powershell
npm run typecheck
```

Exit code 0, no diagnostics:

```text
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.web.json --noEmit
```

## Production build

```powershell
npm run build
```

Exit code 0:

```text
vite v7.3.8 building client environment for production...
✓ 70 modules transformed.
dist/web/index.html                    2.33 kB │ gzip:  0.81 kB
dist/web/assets/index-*.css           40.34 kB │ gzip:  7.96 kB
dist/web/assets/index-*.js           440.25 kB │ gzip: 121.00 kB
✓ built in 1.64s

dist\server\index.js  141.5kb
Done in 8ms
```

The build runs both TypeScript projects, the SPA bundle and the server bundle.
`npm start` runs plain Node 24.

## Built-server verification on port 8106

Command family:

```powershell
$env:DEMO_MODE='true'; $env:DATABASE_PATH='./data/t001-smoke.db'; $env:PORT='8106'
node dist/server/index.js
```

Observed with real HTTP requests:

```text
GET  /api/public/config   200 {"demoMode":true,"productName":"StatusPulse","demoResetMinutes":60}
GET  /api/public/status   200 overall=down groups=3 demo=True activeIncidents=1
POST /api/auth/demo       200 user=demo@statuspulse.local isDemo=True csrfLen=64
GET  /api/admin/summary   200 monitors=6 up=5 down=1 open=1
GET  /api/admin/audit     200 entries=2 first=auth.demo
GET  /                    200
CSP                       default-src 'self'; ... style-src 'self'; script-src 'self'
X-Frame-Options           DENY
X-Content-Type-Options    nosniff
Cache-Control (asset)     public, max-age=31536000, immutable
Cache-Control (API)       no-store
Font /fonts/readex-pro-arabic.woff2  200, 22,864 bytes
```

The demo dataset was rebuilt with:

```powershell
$env:DATABASE_PATH='./data/t001-smoke.db'
npm run demo:reset
```

Observed:

```text
Demo dataset rebuilt: 6 components, 21247 synthetic checks.
The public page states that this is demo data.
The scheduler never checks demo components.
```

## Real browser and screenshot pass

`node scripts/capture-screenshots.mjs http://127.0.0.1:8106` used headless
Chrome through the Chrome DevTools Protocol (no added dependency). It signed in
via the real `POST /api/auth/demo` route and captured **41 real screenshots** with a 375 / 768 / 1366 px overflow check:

```text
login-ar-desktop, login-en-desktop, login-ar-mobile
admin-overview-ar-desktop, admin-overview-ar-mobile, admin-overview-ar-tablet
admin-monitors-ar-desktop, admin-monitors-ar-mobile, admin-monitors-ar-tablet, admin-incident-detail-ar, admin-incident-detail-en, admin-monitors-ar-filter-mobile
admin-monitor-detail-ar-desktop
admin-incidents-ar-desktop, admin-maintenance-ar-desktop
admin-activity-ar-desktop, admin-notifications-ar-desktop, admin-notifications-ar-mobile, admin-notifications-ar-tablet, admin-settings-ar-desktop
public-ar-desktop, public-ar-mobile, about-ar-desktop, help-ar-desktop
admin-overview-en-desktop, admin-overview-en-mobile, admin-overview-en-tablet
admin-monitors-en-desktop, admin-monitors-en-mobile, admin-monitors-en-tablet
admin-monitor-detail-en-desktop
admin-incidents-en-desktop, admin-maintenance-en-desktop
admin-activity-en-desktop, admin-notifications-en-desktop, admin-notifications-en-mobile, admin-notifications-en-tablet, admin-settings-en-desktop
public-en-desktop, public-en-mobile, about-en-desktop, help-en-desktop
admin-overview-light-en-desktop
```

The pass verified that CSS, JS and both self-hosted fonts load under the strict
CSP with no `unsafe-inline`, that Arabic RTL and English LTR both render, and
that 375px, 768px and 1366px layouts have no horizontal overflow. Screenshots
are in `docs/screenshots/`.

## Dependencies

```powershell
npm audit
```

Result after release 1.1 upgrades:

```text
found 0 vulnerabilities
```

Upgraded: `zod` 4.6.7, `@hono/node-server` 2.1.11, `vitest` 5.1.1.

## Not tested / limitations

- Real webhook delivery to an external endpoint: disabled by default; SSRF and
  disabled-route behaviour are tested, but no external webhook was contacted.
- Email/SMS: not implemented.
- Automated axe/screen-reader audit: not run; contrast, labels, focus and
  keyboard flow were reviewed manually and via the screenshots.
- Load/soak testing: not run.
- 2FA, password reset and multi-user roles: not implemented.
- HTTPS termination: not configured; HSTS is tested with an HTTPS config but no
  real certificate was deployed.
- The shared demo dataset is not isolated per visitor.

## Reproduce

```powershell
npm install
npm test
npm run typecheck
npm run build
npm audit
$env:DEMO_MODE='true'
npm start
# then open http://localhost:8106/ and http://localhost:8106/login
node scripts/capture-screenshots.mjs http://127.0.0.1:8106
```
