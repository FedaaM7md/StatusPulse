# Brand — StatusPulse

StatusPulse is an Arabic-first uptime monitor with a calm public status page
and a dense operations console. The product name always stands alone. Owner
credit appears only on the bottom footer line, never near the logo.
The demo public page belongs to the fictional fintech **Wasla Pay / وصلة باي**;
the product itself remains StatusPulse.

## Logo

Original SVG, drawn for this product: a heartbeat trace held inside two square
brackets. The brackets read as an operator console; the pulse reads as service
health. The final dot is operational green.

- Mark: `src/web/components/Logo.tsx` (`LogoMark`)
- Favicon: `src/web/public/favicon.svg`
- Wordmark: "Status" in ink + "Pulse" in accent cyan
- Clear space: at least the height of the mark on every side
- Don't: put the mark in a rounded square, add gradients, rotate it, or combine
  it with another logo.

Owner credit lives on the bottom footer line only: "© 2026 StatusPulse. All
rights reserved." plus "Designed & built by Fedaa Mohamed" linking to
<https://fedaamohamed.com> (rel="noopener"). Arabic: "© 2026 StatusPulse.
جميع الحقوق محفوظة." plus "تصميم وتطوير: فداء محمد". Never place the owner name
under the logo, in a page header or in a page title.

## Colours

### Dark console (default)

| Token | Hex | Use |
| --- | --- | --- |
| `bg` | `#0B0F14` | Page background |
| `panel` | `#121821` | Panels, sidebar |
| `panel2` | `#18202B` | Table heads, inputs, quiet fills |
| `line` | `#26313E` | Hairlines and borders |
| `line-strong` | `#3A4A5C` | Hover and focus borders |
| `ink` | `#D7E0EA` | Primary text |
| `muted` | `#8A99AD` | Secondary text |
| `faint` | `#7A8B9E` | Metadata |
| `accent` | `#4CC9F0` | Cyan accent, links, focus |
| `up` | `#3DDC84` | Operational |
| `degraded` | `#F5B83D` | Degraded |
| `down` | `#FF5A5F` | Outage |
| `maint` | `#78B2FF` | Maintenance |

### Light console

`bg #F2F5F8`, `panel #FFFFFF`, `panel2 #F7F9FB`, `line #DBE2E9`,
`line-strong #BECAD6`, `ink #16202C`, `muted #58697A`, `faint #667788`,
`accent #087E9E`, `up #148240`, `degraded #946200`, `down #B62A2F`,
`maint #1E52C8`.

### Public status

`bg #F6F8FA`, `panel #FFFFFF`, `panel2 #FAFCFE`, `line #E2E8EF`,
`line-strong #C6D1DC`, `ink #141C26`, `muted #5C6A7A`, `faint #657382`,
`accent #087E9E`, `up #148240`, `degraded #946200`, `down #B62A2F`,
`maint #1E52C8`.

The public page is always light and calm; the admin console defaults to dark and
offers a light theme. Login is always a dark operations console.

## Typography

- **Readex Pro** (OFL-1.1, self-hosted WOFF2) — UI and Arabic text.
- **JetBrains Mono** (OFL-1.1, self-hosted WOFF2) — numbers, timestamps, status
  codes, component identifiers and terminal-like details.
- Fallbacks: Segoe UI / Tahoma / system UI for text; Consolas / system mono for
  numbers.
- No Cairo, no Google Fonts CDN, no third-party font service at runtime.

## Layout and rhythm

- Admin: compact 236px sidebar, a live top strip, dense tables, hairline
  borders, 2–4px radii. Data first; decoration last.
- Public: a single document column, no marketing hero and no gradient blobs.
  The overall status strip, grouped component rows, then incidents.
- Asymmetry is deliberate: the main health board and the incident rail have
  different widths and weights.
- Money and numbers use tabular figures and ISO-like timestamps
  (`2026-11-24 02:15`) to avoid bidi ambiguity.

## Voice

Terse, factual, operator-to-operator. Give the state, the time and the next
action. No hype, no exclamation marks, no "seamless", "empower", "unlock",
"revolutionize", "بكل سهولة", "ارتقِ" or "حلول متكاملة".

Examples:

- "API gateway is down. Incident opened 02:15."
- "3 checks failed. Retry in 60s."
- "بوابة الدفع متوقفة. فُتحت الحادثة 02:15."

## Glossary

| English | العربية | Meaning |
| --- | --- | --- |
| Monitor | مراقبة | A configured check |
| Component | مكوّن | A public status entry |
| Check | فحص | One execution of a monitor |
| Uptime | التوفر | Weighted availability |
| Incident | حادثة | An outage or degradation record |
| Maintenance window | نافذة صيانة | Planned suppression period |
| Degraded | أداء متدهور | Slow or partially failing |
| Outage | انقطاع | Down |
| Operational | يعمل | Up |
| Operator | مشغّل | Admin console user |

## Do / don't

Do: show the real board, use real timestamps, keep one accent, align numbers,
use square or 2–4px corners, write short concrete sentences.

Don't: gradient hero sections, glassmorphism, emoji icons, floating mock
cards, "trusted by" rows, purple/indigo gradients, pill badges on every
heading, identical card grids, or fake screenshots.
