# Third-party notices — StatusPulse

StatusPulse is original code. No source code was copied from another product or
open-source application. The logo, UI, charts and all screens were designed for
this project.

## Licence policy

Only MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0 and ISC dependencies are used,
plus fonts under the SIL Open Font License 1.1. No GPL, AGPL, LGPL or CC-BY
package is present. A full `node_modules` scan during release 1.1 reported **no
disallowed licences**. `npm audit` reports **0 vulnerabilities**.

## Direct runtime dependencies

| Package | Version | Licence | Purpose |
| --- | --- | --- | --- |
| `@hono/node-server` | 2.1.11 | MIT | Node adapter for Hono |
| `better-sqlite3` | 12.11.1 | MIT | SQLite driver |
| `hono` | 4.13.21 | MIT | HTTP routing and middleware |
| `react` | 19.3.1 | MIT | UI library |
| `react-dom` | 19.3.1 | MIT | React renderer |
| `zod` | 4.6.7 | MIT | Server-side validation |

## Direct development dependencies

Not shipped in the server bundle (packages are externalised) and only used for
build/test/type-checking.

| Package | Version | Licence | Purpose |
| --- | --- | --- | --- |
| `@fontsource-variable/jetbrains-mono` | 5.3.0 | OFL-1.1 (font) | Self-hosted metric font source |
| `@fontsource-variable/readex-pro` | 5.3.0 | OFL-1.1 (font) | Self-hosted UI font source |
| `@types/better-sqlite3` | 7.6.13 | MIT | Type definitions |
| `@types/node` | 24.19.2 | MIT | Node type definitions |
| `@types/react` | 19.3.0 | MIT | React type definitions |
| `@types/react-dom` | 19.3.0 | MIT | React DOM type definitions |
| `esbuild` | 0.25.12 | MIT | Server bundle and JSX transform |
| `postcss` | 8.5.33 | MIT | CSS processing |
| `tailwindcss` | 3.4.19 | MIT | Utility CSS framework |
| `tsx` | 4.23.15 | MIT | TypeScript execution for dev/CLI |
| `typescript` | 5.9.3 | Apache-2.0 | Type checker/compiler |
| `vite` | 7.3.8 | MIT | Frontend bundler |
| `vitest` | 5.1.1 | MIT | Test runner |

## Fonts

### Readex Pro

- Copyright 2019 The Readex Pro Project Authors
  (<https://github.com/ThomasJockin/readexpro>).
- Licence: SIL Open Font License 1.1 (OFL-1.1).
- Self-hosted files:
  - `src/web/public/fonts/readex-pro-arabic.woff2`
  - `src/web/public/fonts/readex-pro-latin.woff2`
  - `src/web/public/fonts/readex-pro-latin-ext.woff2`
- Licence text: `src/web/public/fonts/OFL-Readex-Pro.txt`.
- Source package: `@fontsource-variable/readex-pro` 5.3.0.

### JetBrains Mono

- Copyright 2020 The JetBrains Mono Project Authors
  (<https://github.com/JetBrains/JetBrainsMono>).
- Licence: SIL Open Font License 1.1 (OFL-1.1).
- Self-hosted file: `src/web/public/fonts/jetbrains-mono-latin.woff2`.
- Licence text: `src/web/public/fonts/OFL-JetBrains-Mono.txt`.
- Source package: `@fontsource-variable/jetbrains-mono` 5.3.0.

No Google Fonts CDN or other font service is contacted at runtime. Cairo was
removed in release 1.1; its files are no longer included.

## Transitive dependencies and native code

All transitive packages scanned from `node_modules` use a permissive licence
(MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause or a permissive dual licence).
No package requires source disclosure.

- `better-sqlite3` bundles SQLite. SQLite is in the public domain (blessing of
  the author), compatible with this project's policy.
- Prebuilt native binaries are downloaded by `prebuild-install` during
  `npm install`; no global install or compiler setup is performed.

## Assets and trademarks

- The StatusPulse logo mark, wordmark, favicon, charts, layout and all
  screenshots are original to this project (screenshots are real captures of
  this UI).
- No third-party logos, brand assets, CDN scripts, analytics or trackers are
  included.
- The product name and logo are trademarks reserved by the owner; see
  `COPYRIGHT.md`.

## Verify

```powershell
node -e "const fs=require('fs'),path=require('path');const bad=[];for(const d of fs.readdirSync('node_modules')){if(d.startsWith('.'))continue;const dirs=d.startsWith('@')?fs.readdirSync(path.join('node_modules',d)).map(x=>d+'/'+x):[d];for(const n of dirs){try{const p=JSON.parse(fs.readFileSync(path.join('node_modules',n,'package.json'),'utf8'));const l=typeof p.license==='string'?p.license:JSON.stringify(p.license||'');if(/GPL|AGPL|LGPL|CC-BY/i.test(l))bad.push(n+': '+l)}catch{}}}console.log(bad.length?bad:'No disallowed licenses found')"
npm audit
```

Reported during release 1.1: `No disallowed licenses found` and
`found 0 vulnerabilities`.
