# Decisions — StatusPulse

Architecture decision records. Each entry records the context, the decision and the trade-off. Deviations from the original brief are called out explicitly.

---

## ADR-001 — Hono as the HTTP framework

**Context:** The task requires a lightweight permissive Node server (Fastify or Hono) with TypeScript strict mode. The app needs routing, middleware, static serving and easy request testing.

**Decision:** Hono 4 with `@hono/node-server`.

**Why:** Small surface, first-class TypeScript types, Web-standard `Request`/`Response` making `app.request()` tests straightforward, and MIT licensed.

**Trade-off:** Fewer batteries than Fastify (for example, no built-in auth or rate-limit plugin), so auth, CSRF and static serving are implemented explicitly. That is desirable for an auditable demo.

---

## ADR-002 — SQLite via better-sqlite3, raw SQL, no ORM

**Context:** Node 24 ships `node:sqlite` (experimental) and better-sqlite3 is a permissive, mature alternative. The data model is small and strongly relational.

**Decision:** better-sqlite3 with synchronous prepared statements, schema created idempotently from `SCHEMA_SQL`, no ORM or query builder.

**Why:** Both drivers were tested; `node:sqlite` printed an `ExperimentalWarning` and exposes a still-changing API. better-sqlite3 is stable, fast, MIT, and its prebuilt binding worked on Node 24 without a compiler. Raw SQL keeps the data model explicit and avoids a large dependency tree.

**Trade-off:** SQL is written by hand and migrations are append-only rather than emitted by a tool. Multi-process writers are not supported (SQLite limitation).

---

## ADR-003 — One process and one port; frontend built and served by the API server

**Context:** The task assigns port 8106 and warns against starting extra servers. A separate Vite dev server would need another port.

**Decision:** `vite build` produces `dist/web`; the Hono server serves the SPA and falls back to `index.html` for client routes. `npm start` runs the bundled server on 8106. `npm run dev` uses `tsx watch` on the same port.

**Why:** Rule-compliant (only 8106), simpler deployment, no CORS, no proxy configuration.

**Trade-off:** Frontend changes require a rebuild (`npm run build:web`). No fast refresh. Documented in INSTALL.md.

---

## ADR-004 — React + Vite + Tailwind, with no router or chart library

**Context:** The UI needs bilingual RTL/LTR layouts, admin tables/forms, a public status page, SVG charts and 90-day bars.

**Decision:** React 19, Vite 7 with the built-in esbuild JSX transform, Tailwind 3.4, a ~50-line History-API router, and hand-written SVG charts/components.

**Why:** Fewer dependencies, full control over RTL logical CSS and no external chart/UI branding. Imports remain type-checked against the same shared types.

**Trade-off:** Some infrastructure (router, modal focus handling, charts) is custom and therefore less battle-tested than a library. Covered by build and component usage; browser E2E remains on the roadmap.

---

## ADR-005 — No `@vitejs/plugin-react`

**Context:** The plugin provides Fast Refresh and Babel integration. It pulls `@babel/core` → `browserslist` → `caniuse-lite`, which is CC-BY-4.0.

**Decision:** Remove the plugin and set `esbuild.jsx = 'automatic'` in `vite.config.ts`.

**Why:** The task permits only MIT/BSD/Apache-2.0/ISC (fonts OFL). The production build only needs JSX transformation, which esbuild handles. This also removes 42 transitive packages.

**Trade-off:** No React Fast Refresh. Since there is no separate Vite dev server, this has no practical impact here.

---

## ADR-006 — Uptime is check-weighted, with maintenance exclusion

**Context:** Continuous uptime can be calculated from wall-clock gaps or from recorded checks. Gaps are ambiguous (paused monitor, server downtime) and can unfairly count as downtime.

**Decision:** `up=1`, `degraded=0.5`, `down=0`; uptime = sum / recorded checks. Results inside maintenance windows are excluded. Days without checks show as “no data”, not 0%.

**Why:** Honest, explainable and reproducible from stored data. The public legend states the method.

**Trade-off:** A monitor that is down but not being checked does not lower uptime; monitors with sparse checks are weighted per check, not per minute. Documented in ROADMAP.md.

---

## ADR-007 — Retries happen inside one check

**Context:** The brief requires “interval, timeout, retries” and incidents on state changes.

**Decision:** Each scheduled check makes up to `retries + 1` attempts, stopping on the first `up`. Only the final attempt is stored. An incident opens on the first stored down/degraded result.

**Why:** Simple, predictable and avoids storing noisy intermediate attempts. Retries absorb transient errors.

**Trade-off:** There is no separate confirmation threshold across scheduled intervals and no multi-region consensus. Noted publicly.

---

## ADR-008 — Private targets require global and per-monitor opt-in

**Context:** SSRF protection must default to blocking private, loopback, link-local, CGNAT and metadata addresses, while allowing documented internal monitoring.

**Decision:** A private target is allowed only when `settings.allow_private_targets` **and** the monitor's `allow_private` flag are both true. Metadata, unspecified, multicast and reserved ranges stay blocked unconditionally.

**Why:** Defence in depth. A global switch alone would let any monitor reach internal infrastructure; a monitor flag alone would let a lower-trust operator bypass the global policy.

**Trade-off:** Two toggles to understand. The UI explains it and the API docs/README repeat the rule. Metadata endpoints cannot be monitored at all, by design.

---

## ADR-009 — Resolve once and pin the connection

**Context:** Validating a hostname and then letting the HTTP client resolve it again allows DNS rebinding (public on validation, private on connect).

**Decision:** Resolve all addresses, classify them, pick one allowed address, and pass a custom `lookup` to `http.request`/`https.request`. Redirects re-run the full validation. TCP and TLS connect to the pinned IP; TLS keeps the original SNI.

**Why:** Closes the rebinding window and makes the guard enforceable at connect time.

**Trade-off:** A CDN with many A records uses the first allowed address per hop without happy-eyeballs across all of them. Node's `autoSelectFamily` needed a lookup adapter (tested).

---

## ADR-010 — Incidents are auto-managed; titles are monitor names

**Context:** Incidents must be bilingual and auto-open/close, with manual updates.

**Decision:** Automatic incidents start as `investigating`, severity major for down and minor for degraded. Incident `title` is the monitor name (user data, language-neutral) rather than a written English sentence. Automatic updates use translation keys (`incidents.autoOpened`, `incidents.resolvedAutomatically`).

**Why:** Avoids storing English prose in the database and keeps public rendering correct in both languages.

**Trade-off:** Renaming a monitor later does not rewrite past incident titles. Manual updates are free text and therefore not translated.

---

## ADR-011 — Notifications: DB + local JSONL, optional webhook disabled

**Context:** The brief requires on-screen notifications and a log file only; the webhook must exist but be disabled by default and SSRF-guarded.

**Decision:** Every notification is a row (for the UI) plus a JSON line in `data/notifications.log`; log failures never break checks. Webhook delivery is an optional extra, off by default, HMAC-signed, 8s timeout, no redirects, always strict SSRF (private targets never allowed).

**Why:** Satisfies the “no email/no third-party service” requirement while leaving a safe extension point. The JSONL file is easy to ship to an external log collector.

**Trade-off:** No delivery retries or dead-letter queue; webhook secret is stored unencrypted in SQLite.

---

## ADR-012 — Session cookies + scrypt + double-submit CSRF

**Context:** The admin console is the only authenticated area.

**Decision:** Server-side sessions in SQLite, 32-byte random IDs, HttpOnly SameSite=Lax cookies, 7-day expiry, session regeneration on login. Passwords use scrypt with per-user salts. CSRF uses a per-session token required in `X-CSRF-Token`, plus an Origin check on unsafe methods. Login throttling is 5 failures per email-or-IP per 15 minutes.

**Why:** No JWT leakage/revocation problem, cheap revocation, strong password storage, and CSRF protection independent of cookies alone.

**Trade-off:** Session lookup on each request (indexed primary key, negligible here); no 2FA or RBAC yet.

---

## ADR-013 — UTC calendar days for 90-day bars

**Context:** The public page shows daily bars but the app has no per-user timezone.

**Decision:** Group by UTC date and label dates with the user's locale/format.

**Why:** Deterministic server-side aggregation and consistent results regardless of the viewer's clock.

**Trade-off:** A day boundary may differ from the operator's local midnight. Documented in ROADMAP.md.

---

## ADR-014 — Flat translation keys imported by both tiers

**Context:** Arabic-first UI with English, and validation/notification messages that originate on the server.

**Decision:** Flat `ar.json`/`en.json` imported by the frontend and by tests. Server validation messages and notification `messageKey` values are translation keys; the client interpolates params. A test enforces key parity, non-empty values, matching placeholders, dynamic key families and that every literal key used in source exists.

**Why:** Prevents half-translated UI and makes the “all strings in translation files” requirement mechanically verifiable.

**Trade-off:** No ICU pluralisation; params are simple `{name}` interpolation. Titles and maintenance/incident messages entered by admins remain free text.

---

## ADR-015 — Self-hosted Readex Pro + JetBrains Mono

**Context:** The release 1.1 identity calls for a technical operations feel with clear Arabic UI
text and tabular numbers. Cairo was the release 1.0 font and must be removed unless the identity
names it.

**Decision:** Self-host Readex Pro for UI/Arabic and JetBrains Mono for metrics and
timestamps. Both are installed from `@fontsource-variable/*`, copied into
`src/web/public/fonts` with their OFL texts, and declared with `font-display: swap` and a
system fallback. No Google Fonts or CDN is contacted.

**Why:** OFL licensing, offline capability, consistent Arabic/Latin rendering, and a clear
separation between prose and operational numbers.

**Trade-off:** Three Readex Pro subsets plus one JetBrains Mono file (~122 KB total) must be
updated manually when the packages change.

---

## ADR-016 — Demo data is labelled, synthetic and resettable

**Context:** release 1.1 requires guest access without registration and a clear demo mode.

**Decision:** `DEMO_MODE` (default true locally) creates a shared demo operator and a
synthetic dataset for a neutral Egyptian company. Demo monitors have `demo = 1`, the
scheduler and manual check route skip them, the UI and public page carry a persistent demo
banner, `/api/auth/demo` is rate limited, and `npm run demo:reset` plus an hourly timer
rebuild the dataset. When `DEMO_MODE=false`, the route returns 404 and the UI entry point
disappears. Demo visitors cannot enable private targets or webhooks.

**Why:** Honest demo data, no fake “real” uptime, a small blast radius, and a one-command
recovery path.

**Trade-off:** The dataset is shared, not isolated per visitor, and a reset does not revoke
existing demo sessions. Documented in ROADMAP/SECURITY.

---

## ADR-017 — Build with esbuild bundling and run with plain Node

**Context:** TypeScript source with extensionless imports and a strict type-check.

**Decision:** Type-check with `tsc --noEmit` for both projects; bundle the server with esbuild (`platform=node`, `packages=external`) and the frontend with Vite; run `dist/server/index.js` with Node 24.

**Why:** One command produces a runnable artifact without a TypeScript loader; faster startup and a smaller dependency surface at runtime.

**Trade-off:** Server output is a single ~126 KB bundle; native `better-sqlite3` remains external and must be installed in `node_modules` on the host.

---

## ADR-018 — Error and validation messages are translation keys

**Context:** API errors need to be understandable in both languages without duplicating dictionaries in the server.

**Decision:** Zod issues and API `message` fields carry keys such as `monitors.invalidUrl` or `errors.csrf`. The web client translates known keys and falls back to the key text for non-UI API consumers.

**Why:** Single source of truth and an automated check that every key exists.

**Trade-off:** Raw API consumers see keys rather than prose; check error strings from the network are stored as plain text (admin-only data) because they are dynamic.

---

## ADR-019 — Deliberate scope limits

**Context:** release 1.0 asks for a complete demo without email, external services or fake functionality.

**Decision:** No email/SMS, no public signup, no 2FA, no RBAC, no Docker, no Postgres, no CDN. Webhook off by default. Checks continue during maintenance. Public page polls every 30 seconds.

**Why:** Keep the implementation honest, auditable and dependency-light while covering every required feature.

**Trade-off:** These gaps are listed in ROADMAP.md and SECURITY.md rather than hidden. They are the first candidates for a follow-up task.

---

## ADR-020 — StatusPulse identity: dark NOC, light public page

**Context:** release 1.1 requires a distinct identity per product. StatusPulse is a technical
operations tool, not a marketing landing page.

**Decision:** CSS-variable tokens plus Tailwind semantic colours. The operator console is
dark by default (`#0B0F14` background, `#121821` panels, cyan `#4CC9F0`, operational green
`#3DDC84`) with a light theme toggle. The public status page is always a calm light
document. Login is always a dark console with a real status-board preview. Typography is
Readex Pro + JetBrains Mono. Corners are 2–4px; shadows are minimal.

**Why:** The visual language matches the job (reading state under pressure), and the public
page stays quiet for customers. Documented in `docs/BRAND.md`.

**Trade-off:** Two theme token sets and three surface contexts (admin, login, public) must
be maintained. The public page intentionally has no dark mode.

---

## ADR-021 — In-memory rate limiting for the single process

**Context:** release 1.1 requires rate limiting on public forms/APIs but the app is one Node
process with SQLite.

**Decision:** A small sliding-window limiter in `lib/rate-limit.ts` protects demo entry and
public reads. Password login keeps its SQLite-backed throttle so it survives a restart.

**Why:** No new dependency, no extra database writes on every status poll, and a clear
scope. Tests can construct a fresh app per case.

**Trade-off:** Demo/public limits reset on restart and do not coordinate across multiple
processes. Acceptable because the app is single-process by design; documented in ROADMAP.

---

## ADR-022 — Audit trail in SQLite, labels in i18n

**Context:** release 1.1 requires an activity/audit log for sensitive admin actions.

**Decision:** An append-only `audit_log` table records operator email, action code, entity,
optional user data (monitor/title name), IP and time. The Activity screen translates the
action code; no English prose is written on the server. Audit rows older than 180 days
are pruned with the other retention jobs.

**Why:** Local, queryable, language-neutral and useful without adding a logging service.

**Trade-off:** There is no tamper-evident hash chain and no export. A database administrator
can edit the table; this is a demo, not a compliance product.

---

## ADR-023 — Strict CSP without inline styles

**Context:** release 1.0 allowed `style-src 'unsafe-inline'` for UI conveniences.

**Decision:** Remove `unsafe-inline` entirely. The only dynamic bar (24h uptime in the
overview) uses SVG geometry instead of a style attribute. React renders no inline `style`
props. HSTS is added only for HTTPS.

**Why:** A materially stronger script/style boundary and a simpler policy to audit.

**Trade-off:** Future components must not use inline `style` or the browser will block
them. Verification is built into the header test and the browser screenshot pass.

---

## ADR-024 — ISO-like numeric timestamps

**Context:** Arabic locale date formatting inserts right-to-left marks that reorder
timestamps inside an LTR monospace run, and mixed Arabic/date paragraphs can display
ambiguously.

**Decision:** Format dates and times deterministically as `YYYY-MM-DD HH:mm` (local time)
in monospace, and keep `Intl.RelativeTimeFormat` for relative labels. Do not force LTR
direction on paragraphs that contain Arabic prose.

**Why:** Unambiguous for operators and screen readers, and it matches the terse voice.

**Trade-off:** Less locale-specific than a fully localized date style; the exact numeric
format is consistent across Arabic and English.

---

## ADR-025 — Password reset without an email provider

**Context:** release 1.1 asks for password reset with a logged mail and expiry, while the product
has no external mail service.

**Decision:** Store a SHA-256 hash of a 32-byte token in `password_resets`, expire it after
30 minutes, mark it used once, revoke all sessions on success, and append the reset URL to
`data/mail.log` and the server log. The request endpoint is rate limited and returns the
same response for known and unknown emails. Demo accounts are refused silently.

**Why:** A complete, testable reset flow without pretending to send email or adding a mail
dependency.

**Trade-off:** The local log contains a usable one-time link and must be treated as
sensitive. Production must replace the log with a real mail provider and remove the log
line.
