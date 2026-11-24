# Security review — StatusPulse (release 1.1)

**Review date:** 2026-11-24
**Scope:** The local Node/SQLite application in this folder, its public status
page, admin API, demo mode and static assets.
**Method:** Source review, dependency audit, automated tests, a built-server
HTTP check on port 8106, and a real headless Chrome pass over the UI.

This is a demo deployment. It is not a substitute for an independent
penetration test.

## Threat model

| Asset | Threat | Control |
| --- | --- | --- |
| Admin session | Session theft, fixation, CSRF | Random server-side sessions, rewritten on login, HttpOnly/SameSite cookie, per-session CSRF token, Origin check on unsafe requests |
| Admin credentials | Brute force, user enumeration | scrypt hashes, dummy hash for unknown emails, 5 failures / 15 min by email or IP, generic error |
| Demo entry | Abuse / resource exhaustion | `DEMO_MODE` kill switch (route returns 404), separate 15/10 min per-IP limiter, 4-hour demo session |
| Public page | Leaking internal targets | Public serializer only exposes name, type, group, state and uptime; URLs, hosts and notes are never included |
| Outbound checks | SSRF, DNS rebinding | Resolve once, classify every address, pin the chosen IP, re-validate every redirect, double opt-in for private targets, metadata blocked unconditionally |
| Admin actions | Repudiation, silent tampering | Append-only local audit table for sign-in, monitor changes, incident updates, maintenance, settings, demo entry/reset |
| Uploads | Malicious content | No upload feature exists; no file input or static user content |
| XSS | Stored/reflected script | React escaping, no `dangerouslySetInnerHTML`, strict CSP with no `unsafe-inline` |
| Dependency supply chain | Known vulnerabilities | `npm audit` clean after upgrades; permissive licences only |
| Secrets | Accidental commit | `.env` ignored, only `.env.example`, no keys or passwords in the repository |

## What was checked and fixed

1. **CSP tightened.** Removed `style-src 'unsafe-inline'`; the UI no longer
   uses inline `style` attributes (the uptime mini-bar is SVG width geometry).
   The policy is now self-only for scripts, styles, fonts, images and
   connections.
2. **Headers completed.** Added HSTS when the app URL is HTTPS or
   `COOKIE_SECURE=true`, `Cross-Origin-Resource-Policy`, cross-domain policy
   denial and DNS-prefetch off.
3. **Login/demo origin check.** Session creation endpoints now reject a
   cross-origin `Origin` even before credentials are processed.
4. **Demo kill switch.** When `DEMO_MODE=false`, `/api/auth/demo` returns 404,
   the login button disappears, and startup seeding is skipped.
5. **Demo blast radius.** Demo visitors have a separate rate limiter, cannot
   enable private targets or webhooks, and cannot reach a password/user
   management endpoint (none exists). The dataset is synthetic, labelled and
   rebuilt hourly; demo components are never checked live.
6. **Session revocation.** Added `POST /api/auth/logout-all` and a settings
   action that revokes every session for the operator.
7. **Password reset.** Added a single-use, hashed, 30-minute reset token with
   session revocation, generic responses and a local `data/mail.log` mail
   preview. Demo accounts cannot be reset. Rate limited per IP/email.
8. **Audit log.** Added an `audit_log` table, API and Activity screen. No
   secrets, passwords or CSRF tokens are stored in it.
9. **Password policy.** CLI creation now requires at least 12 characters and
   the translated error text matches.
10. **Dependencies.** Upgraded `zod` (memory exhaustion advisory),
   `@hono/node-server` (static-path decoding advisory) and `vitest` (dev
   toolchain advisories). `npm audit` reports 0 vulnerabilities.
11. **Rate limits.** Login has its existing failure throttle; demo entry has a
    per-IP limiter; password reset has a per-IP/email limiter; public read APIs
    have a 240 requests/minute per-IP ceiling so a status page can poll every
    30 seconds safely.
12. **Audit summaries.** Removed English prose written by the server from the audit
    trail; action labels are translated in the UI.
13. **CSV export.** Monitor history can be exported by the authenticated
    operator; cells beginning with `= + - @`, tab or CR are prefixed with an
    apostrophe to prevent spreadsheet formula injection, and the response is
    `text/csv` with an `attachment` disposition.

## Verification evidence

- `npm test`: **181 tests / 17 files passed**, including CSP/header assertions,
  cross-origin rejection, audit entries, session revocation, demo 404/kill
  switch, demo rate limiting and demo security-setting rejection.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0 (frontend 440 kB / 121.0 kB gzip; server 141.5 kB).
- Built server on 8106: CSP `script-src 'self'`, `style-src 'self'`, no
  `unsafe-inline`; `X-Frame-Options: DENY`; `nosniff`; `Cache-Control:
  no-store` on API; static assets immutable; fonts self-hosted.
- Headless Chrome captured 41 real screenshots (Arabic/English, desktop/mobile,
  dark/light admin) with no console-blocking CSP failure.

## Remaining risks (accepted for this demo)

1. One admin role; no 2FA, forced rotation, RBAC or user management. Password
   reset is implemented with a local mail log, not a real email provider.
2. SQLite and a single process; no HA, encryption at rest or automated backups.
3. The demo dataset is shared by all visitors and reset hourly, not isolated
   per visitor. Session cookies survive a reset.
4. Webhook delivery remains disabled by default; no retry queue. The secret is
   stored in plaintext SQLite.
5. No public registration, uploads, Markdown or HTML rendering. If any is
   added later, it needs its own threat review.
6. `connect-src 'self'` means a future third-party integration must be added to
   the CSP deliberately.
7. No independent penetration test, axe run or load test was performed; the
   contrast and keyboard pass is manual and code-level.
8. `APP_DEBUG=false` is the documented default; turning it on in production
   would expose error details.

## Minimum production checklist

- [ ] `DEMO_MODE=false`, `NODE_ENV=production`, `APP_DEBUG=false`.
- [ ] HTTPS reverse proxy; `APP_URL` set to the HTTPS origin and
  `COOKIE_SECURE=true`.
- [ ] Replace the demo database; create a strong operator password.
- [ ] Back up `data/statuspulse.db` and test a restore.
- [ ] Keep `allow_private_targets` off unless the whole deployment is trusted.
- [ ] Monitor the monitor itself from outside this host.
- [ ] Re-run `npm audit`, the test suite and a new security review after any
  feature change.
