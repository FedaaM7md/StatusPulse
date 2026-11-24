# Security — StatusPulse

> **Demo deployment, not a production-hardened service.** Use it behind HTTPS
> with a real review, backups and monitoring. See
> [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) for the release 1.1 threat model
> and the remaining risks.

## Deployment model

- One Node.js process on port 8106 and SQLite on the local filesystem.
- One operator role. No public registration.
- `DEMO_MODE=true` by default: one-click guest access without a password,
  labelled synthetic data, hourly reset. Set `DEMO_MODE=false` for a real
  deployment; the demo route then returns 404 and the UI entry point disappears.
- The public status page is read-only and never exposes monitor URLs, hosts,
  notes, error causes or check details.

## Authentication and sessions

- scrypt hashes (`N=16384`, `r=8`, `p=1`, 64-byte key, random salt) via
  `node:crypto`; timing-safe comparison.
- Unknown emails still run a dummy hash to reduce timing differences.
- Minimum password length for CLI-created operators is 12 characters.
- Login throttle: 5 failures per email **or** IP in 15 minutes, HTTP 429 with
  `Retry-After`.
- Demo entry has a separate limiter: 15 attempts per IP per 10 minutes.
- Sessions: 32 random bytes, server-side in SQLite, 7-day expiry, rewritten
  on every login. Cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure`
  when `COOKIE_SECURE=true`.
- `POST /api/auth/logout-all` revokes every session for the operator.
- Login and demo session creation reject a cross-origin `Origin`.
- Password reset uses a single-use SHA-256-hashed token, expires after 30
  minutes, revokes all sessions and is rate limited. Because this demo has no
  mail provider, the link is appended to `data/mail.log` and the server log. The
  HTTP response is identical for known and unknown emails. Demo accounts cannot
  be reset.

## Authorization and CSRF

- Every `/api/admin/*` route requires a valid session.
- Every unsafe admin request needs `X-CSRF-Token`, matched in constant time
  against the session token; an `Origin` header, when present, must match the
  app host.
- Demo visitors are blocked from enabling private targets or webhooks
  (`403 demo.restricted`).
- There is no password/email change endpoint and no user-management endpoint,
  so a demo visitor cannot change credentials or create admins.

## Input, output and privacy

- Zod validates every JSON body on the server; validation messages are
  translation keys.
- Prepared SQL statements only; no value interpolation.
- React escapes all output; no `dangerouslySetInnerHTML`.
- Request bodies are capped at 256 KiB.
- Public serializers are allowlists, not filtered internal records.
- No uploads, Markdown or user HTML feature exists.
- The Activity screen records operator email, action, entity, source IP and
  time locally. It never stores passwords, session IDs or CSRF tokens.

## Headers and CSP

```text
Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; img-src 'self' data:; font-src 'self'; style-src 'self';
  script-src 'self'; connect-src 'self'; object-src 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
X-Permitted-Cross-Domain-Policies: none
X-DNS-Prefetch-Control: off
Strict-Transport-Security: max-age=31536000; includeSubDomains (HTTPS only)
Cache-Control: no-store (API)
```

No CDNs, trackers, analytics or third-party logos. Fonts and all assets are
self-hosted. CSP has no `unsafe-inline` and no `unsafe-eval`.

## SSRF guard

The default policy rejects private, loopback, link-local, CGNAT, metadata,
documentation, benchmark, multicast, reserved and unique-local ranges, plus
IPv4-mapped/NAT64/6to4/Teredo edge cases. Hostnames are resolved once and the
validated IP is pinned for HTTP, TCP and TLS; redirects are re-validated and
re-pinned. Private targets require both the global setting and the per-monitor
flag; metadata stays blocked even then. The webhook sender is always strict.
DNS monitors query the resolver only and never connect to the result.

## Notifications and demo

- Notification centre and `data/notifications.log` only; no email/SMS.
- Webhook sender is disabled by default, HMAC-SHA256 signed, 8s timeout, no
  redirects, SSRF-strict; no retry queue.
- Demo data is synthetic, labelled on screen and in the site description.
  `npm run demo:reset` rebuilds it; the server also resets it every
  `DEMO_RESET_MINUTES` (default 60). Demo components are never checked live.
- Demo sessions survive a reset; the data is shared by all visitors.

## Repository and secrets

- `.env` is ignored; only `.env.example` with dummy values is committed and
  keeps `APP_DEBUG=false`.
- Database, logs, `dist/`, `node_modules/`, coverage and editor files are
  ignored.
- No remote is configured and nothing is pushed.
- Dependencies: MIT/BSD/Apache-2.0/ISC plus OFL fonts. `npm audit` reports 0
  vulnerabilities after the release 1.1 upgrades.

## Known limitations

1. One admin role; no 2FA, RBAC, teams or user management. Password reset uses
   a local mail log, not a real email provider.
2. SQLite and a single process: no HA, encryption at rest or automated backups.
3. The shared demo dataset is not isolated per visitor.
4. Webhook secret is stored unencrypted and delivery has no retries.
5. No independent penetration test, axe audit or load test.
6. No production TLS termination is included; use a reverse proxy.
7. `style-src` no longer needs `unsafe-inline`; do not reintroduce inline
   styles without updating the policy.

## Reporting

Report issues privately to the project owner. Include the endpoint, exact
reproduction steps and impact. Do not test systems you do not own.
