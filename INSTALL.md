# Installation — StatusPulse

Exact commands used to install, build and verify this project on Windows.

## Verified environment

| Component | Version |
| --- | --- |
| Node.js | v24.12.0 |
| npm | 11.6.2 |
| Git | 2.51.1.windows.1 |
| OS | Windows (win32) |
| Port | 8106 |
| PHP / Composer | Not used by this project |

No global packages were installed and no PATH, registry, system npm/composer
configuration or Windows setting was changed. No Docker or WSL is used.

## 1. Open the project

```powershell
cd statuspulse
```

The project has its own local Git repository and no remote.

## 2. Install dependencies

```powershell
npm install
```

Direct dependencies and licences are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). `better-sqlite3` downloads a
prebuilt binding for Node 24; no compiler is required. The two OFL font packages
are installed so their WOFF2 files and licences can be self-hosted from
`src/web/public/fonts/`; the application never contacts a font CDN.

## 3. Environment (optional locally)

The app runs with safe defaults. To customise:

```powershell
Copy-Item .env.example .env
notepad .env
```

Never commit `.env`.

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=8106
DATABASE_PATH=./data/statuspulse.db
APP_URL=http://localhost:8106
APP_DEBUG=false
COOKIE_SECURE=false
DEMO_MODE=true
DEMO_RESET_MINUTES=60
```

Set `DEMO_MODE=false` for a real deployment. Set `COOKIE_SECURE=true` and an
HTTPS `APP_URL` behind TLS; HSTS is sent only for HTTPS.

## 4. Build

```powershell
npm run build
```

This runs both TypeScript checks, `vite build` into `dist/web`, and an esbuild
server bundle into `dist/server/index.js`.

## 5. Run

```powershell
npm start
```

Expected log lines (JSON):

```json
{"level":"info","msg":"Demo dataset ready","meta":{"monitors":6,"results":21247}}
{"level":"info","msg":"Scheduler started","meta":{"tickIntervalMs":1000}}
{"level":"info","msg":"StatusPulse listening","meta":{"port":8106,"demoMode":true}}
```

Open:

- Public status — <http://localhost:8106/>
- Console sign-in — <http://localhost:8106/login>
- Health — <http://localhost:8106/api/public/healthz>

Stop with `Ctrl+C`; the scheduler, demo timer and database close gracefully.

## 6. Demo access

With `DEMO_MODE=true`, the login page shows **Try the demo**. One click creates
a guest session for the shared demo operator. The dataset is rebuilt
automatically every `DEMO_RESET_MINUTES`; you can also rebuild it manually:

```powershell
npm run demo:reset
```

The demo company is "Wasla Pay" / "وصلة باي", all data is
labelled synthetic, and demo components are excluded from live checks.

To create a real operator instead:

```powershell
npm run create-admin -- --email you@example.com --password "ChangeMe-123456" --name "Operator"
```

Expected output:

```text
Admin account ready: you@example.com (id 1).
Database: ./data/statuspulse.db
```

Passwords are scrypt-hashed (N=16384, r=8, p=1, 64-byte key, random salt) and
must be at least 12 characters. Re-running with an existing email updates that
account's password. The password can also come from `ADMIN_PASSWORD`.

## 7. Verify

```powershell
npm test
npm run typecheck
npm run build
npm audit
```

`npm test` must report **181 passed**; `npm audit` must report 0 vulnerabilities.
See [TESTING.md](TESTING.md) for the recorded output.

## 8. Capture screenshots (optional)

The app must be running on 8106 and Chrome installed:

```powershell
node scripts/capture-screenshots.mjs http://127.0.0.1:8106
```

It uses the Chrome DevTools Protocol directly (no extra dependency), signs in
through the real demo route, and writes Arabic/English desktop/mobile and
dark/light captures into `docs/screenshots/`.

## Development notes

- `npm run dev` starts the server with `tsx watch` on 8106 and serves the last
  built frontend, so run `npm run build` after frontend changes.
- There is intentionally no second dev port.
- SQLite runs in WAL mode with foreign keys and a 5s busy timeout.
- `data/` is ignored by Git and contains the SQLite database, the notification
  log and `mail.log` (the demo preview of password-reset mail).
- Use a separate database for a smoke run:

```powershell
$env:DATABASE_PATH='./data/smoke.db'
$env:DEMO_MODE='false'
npm run create-admin -- --email admin@example.com --password "SmokeTest-123456"
npm start
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `EADDRINUSE` on 8106 | Another process is using the assigned port. Stop it; do not switch ports. |
| 503 “frontend has not been built yet” | Run `npm run build` before `npm start`. |
| Login returns 429 | Throttled after 5 failures in 15 minutes. Wait or use a fresh development database. |
| Demo route returns 404 | `DEMO_MODE` is false. Set it to true or use a real operator account. |
| Checks fail with “Blocked target” | Private target. Enable both the global setting and the per-monitor flag only for services you own. |
| `better-sqlite3` fails to load | Re-run `npm install` with Node 24; the prebuilt binding must match the Node ABI. |
| Fonts look like a system fallback | Confirm `npm run build` copied `/fonts/*` and the browser can fetch them without a CSP error. |

There is no Docker, WSL, global install or external database requirement.
