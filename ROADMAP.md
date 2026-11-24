# Roadmap — StatusPulse

Honest status. “Delivered” means implemented and exercised in this folder;
“next” means not implemented and not claimed to work.

## Delivered

### Product

- HTTP(S), TCP, DNS (A/AAAA/CNAME/TXT/MX) and TLS monitors with status,
  keyword, latency, expiry and trust rules.
- In-process scheduler with intervals, timeouts, in-check retries and a daily
  pruning cycle.
- Automatic incident open/close, manual timeline updates, global or per-
  component maintenance windows with incident suppression.
- Operator console: live readings, component board, latency chart, 90-day bars,
  latest results, incident timeline, maintenance, notifications, settings and a
  local activity log.
- Public status page: grouped components, overall strip, 90-day bars, active
  incidents, resolved history, maintenance, Arabic RTL and English LTR.
- One-click demo access with labelled synthetic data, hourly reset, kill switch
  and demo restrictions.
- Single-use password reset with 30-minute expiry, local mail preview and
  session revocation.
- SSRF guard with resolve-once/pin-the-IP, redirect revalidation and a private
  target double opt-in.
- Self-hosted Readex Pro and JetBrains Mono, dark NOC console, calm light public
  page, light admin theme.
- 181 automated tests, both TypeScript checks, production build, real browser
  screenshots and a built-server run on port 8106.

### Documentation and ownership

- README (Arabic + English), INSTALL, TESTING, SECURITY, ROADMAP,
  THIRD-PARTY-NOTICES, COPYRIGHT, LICENSE.
- `docs/BRAND.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
  `docs/SECURITY-REVIEW.md`.
- Real screenshots in `docs/screenshots/` for Arabic/English, desktop/mobile and
  dark/light admin.

## Missing / next

### Product

1. Email/SMS notifications and subscriber lists with double opt-in.
2. Multi-user accounts, roles (owner/operator/viewer), teams and scoped access.
3. 2FA, forced password rotation and account recovery flows.
4. API tokens for machine access with scopes and rate limits.
5. Custom domains, logo upload with image re-encoding, theme editor, component
   ordering and hidden components.
6. Manual incidents, severity editing, postmortems and scheduled-incident
   reminders.
7. Time-weighted uptime, SLA reports, CSV/PDF exports and range pickers.
8. Maintenance options: pause checks, auto-close incidents at start, recurrence.
9. p50/p95/p99 latency and multi-region checks.
10. Alert grouping, flapping suppression and maintenance-aware routing.
11. Per-visitor isolated demo workspaces (the current demo is shared).

### Platform

12. PostgreSQL/Redis and versioned migrations for multi-instance deployments.
13. Distributed scheduler with leader election or a job queue.
14. Prometheus/OpenTelemetry metrics and request IDs.
15. Webhook retries, dead-letter queue, delivery history and secret rotation UI.
16. Configurable retention in the UI (currently fixed: results 180 days,
    notifications 90 days).
17. Encryption at rest for the webhook secret and a secret manager integration.
18. Backups, restore drills and disaster recovery.
19. Container packaging (Docker/WSL was prohibited for this task).
20. Horizontal per-IP/account rate limiting and a WAF-style budget.

### Quality

21. Browser E2E tests (Playwright) and visual regression; the current pass is a
    real headless Chrome capture, not an automated regression suite.
22. Load and soak testing of the scheduler and public endpoint.
23. Automated axe and screen-reader audit beyond the manual labels/focus/
    contrast pass.
24. CSP nonce/hash strategy and Trusted Types (the current CSP already has no
    `unsafe-inline`).
25. More locales and ICU pluralisation; the current i18n uses flat keys and
    simple interpolation.
26. Public dark theme (the public page is intentionally light).
27. Dependency automation, SBOM generation and signed releases.

## Known deviations from a “full SaaS”

- SQLite and one Node process, not Postgres and workers.
- Retries happen inside one scheduled check; no multi-region confirmation.
- Uptime is check-weighted: `up=1`, `degraded=0.5`, `down=0`; maintenance
  results are excluded.
- Daily bars use UTC calendar days.
- Public page polls every 30 seconds; no WebSocket/SSE.
- No email delivery: on-screen notifications, a local JSONL log and an optional
  disabled webhook only.
- The shared demo dataset is synthetic, labelled and reset hourly.
- HTTP keyword checks read at most 256 KiB; a keyword beyond that cap is missed.
- No automated accessibility or load test has been run.
