/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { ReactElement, SVGProps } from 'react';

export type IconName =
  | 'gauge'
  | 'activity'
  | 'alert'
  | 'calendar'
  | 'bell'
  | 'settings'
  | 'globe'
  | 'logout'
  | 'menu'
  | 'close'
  | 'plus'
  | 'check'
  | 'clock'
  | 'refresh'
  | 'trash'
  | 'edit'
  | 'external'
  | 'shield'
  | 'server'
  | 'back'
  | 'lock'
  | 'chart'
  | 'inbox'
  | 'chevron'
  | 'mail'
  | 'sun'
  | 'moon'
  | 'pulse'
  | 'terminal'
  | 'audit'
  | 'filter'
  | 'key'
  | 'play'
  | 'copy'
  | 'wifi';

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

const paths: Record<IconName, ReactElement> = {
  gauge: (
    <>
      <path d="M4.5 18a9 9 0 1 1 15 0" />
      <path d="m12 13 3.5-3.5" />
      <circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  activity: <path d="M3 12h3.5l2.3-6.5 4.4 13 2.3-6.5H21" />,
  alert: (
    <>
      <path d="M12 4.5 21 20H3L12 4.5Z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.4" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M8 3.5V7M16 3.5V7M3.5 10h17" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h7M15 17h5" />
      <circle cx="16" cy="7" r="1.8" />
      <circle cx="8" cy="12" r="1.8" />
      <circle cx="13" cy="17" r="1.8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.3 3.8 8.5S14.6 18.1 12 20.5c-2.6-2.4-3.8-5.3-3.8-8.5S9.4 5.9 12 3.5Z" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4.5H6.5A2 2 0 0 0 4.5 6.5v11a2 2 0 0 0 2 2H14" />
      <path d="M10 12h10M17 8.5 20.5 12 17 15.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-13.7-4.8L4 8.5" />
      <path d="M4 4.5v4h4" />
      <path d="M4 13a8 8 0 0 0 13.7 4.8L20 15.5" />
      <path d="M20 19.5v-4h-4" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9 7V4.8h6V7M6.5 7l.9 12.2A2 2 0 0 0 9.4 21h5.2a2 2 0 0 0 2-1.8L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4.2L20 8.2 15.8 4 4 15.8V20Z" />
      <path d="m13.6 6.2 4.2 4.2" />
    </>
  ),
  external: (
    <>
      <path d="M14 5h5v5M19 5l-7.5 7.5" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.2c0 4.5-3 7.7-7 9.3-4-1.6-7-4.8-7-9.3V6l7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="4" width="17" height="6.5" rx="1" />
      <rect x="3.5" y="13.5" width="17" height="6.5" rx="1" />
      <path d="M7 7.2h.01M7 16.8h.01" />
    </>
  ),
  back: <path d="M19 12H5M11 18l-6-6 6-6" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="1.5" />
      <path d="M8 10V7.8a4 4 0 0 1 8 0V10" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6M20 16v-9" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13.5 6.5 5h11L20 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-5.5Z" />
      <path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />,
  pulse: <path d="M2.5 12h4l2.2-6 4.6 12 2.4-6h6" />,
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="1" />
      <path d="m7 9 3 3-3 3M13 15h4" />
    </>
  ),
  audit: (
    <>
      <path d="M5 4.5h11l3 3v12H5v-15Z" />
      <path d="M8.5 9h6M8.5 12.5h7M8.5 16h4" />
    </>
  ),
  filter: <path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z" />,
  key: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H21M17 12v3M20 12v2" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="1" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </>
  ),
  wifi: <path d="M4 9a12 12 0 0 1 16 0M7 12.5a7.5 7.5 0 0 1 10 0M10 16a3 3 0 0 1 4 0M12 19.5h.01" />,
};
