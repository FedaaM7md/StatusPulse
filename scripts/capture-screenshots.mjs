/**
 * Real headless-browser captures for docs/screenshots.
 *
 * Requires the built app to be running on the assigned port and Chrome/Edge
 * installed locally. Uses the Chrome DevTools Protocol directly, so it adds no
 * dependency to the project.
 *
 * Usage: node scripts/capture-screenshots.mjs http://127.0.0.1:8106
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8106';
const OUT = path.resolve('docs/screenshots');
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223;

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), 'statuspulse-shots-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDevtools() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

await waitForDevtools();

const targetResponse = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
const target = await targetResponse.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);

let nextId = 0;
const pending = new Map();
const eventWaiters = new Map();

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method && eventWaiters.has(message.method)) {
    const waiters = eventWaiters.get(message.method);
    eventWaiters.delete(message.method);
    for (const resolve of waiters) resolve(message.params);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  nextId += 1;
  const id = nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function waitEvent(method) {
  return new Promise((resolve) => {
    const waiters = eventWaiters.get(method) ?? [];
    waiters.push(resolve);
    eventWaiters.set(method, waiters);
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}

async function navigate(url, delay = 900) {
  const loaded = waitEvent('Page.loadEventFired');
  await send('Page.navigate', { url });
  await Promise.race([loaded, sleep(6000)]);
  await evaluate(`new Promise((r) => setTimeout(r, ${delay}))`, true);
}

async function viewport(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

const overflow = [];

async function checkOverflow(label, width) {
  const measured = await evaluate(
    `({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth, body: document.body.scrollWidth })`,
  );
  if (measured.scroll > width + 1 || measured.body > width + 1) {
    overflow.push(`${label}: scroll=${measured.scroll} body=${measured.body} viewport=${width}`);
    console.log(`OVERFLOW ${label}: ${measured.scroll}/${measured.body} > ${width}`);
  } else {
    console.log(`ok ${label} ${width}px`);
  }
}

async function capture(file, width, height, mobile, fullPage = true) {
  await viewport(width, height, mobile);
  await evaluate('window.scrollTo(0,0)');
  await sleep(250);
  await checkOverflow(file, width);
  const metrics = await send('Page.getLayoutMetrics');
  const content = metrics.cssContentSize ?? metrics.contentSize;
  const fullHeight = fullPage ? Math.min(Math.max(height, Math.ceil(content.height)), 5200) : height;
  await viewport(width, fullHeight, mobile);
  await evaluate('window.scrollTo(0,0)');
  await sleep(250);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(OUT, file), Buffer.from(shot.data, 'base64'));
  console.log(`captured ${file} (${width}x${fullHeight})`);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  // 1366 is the desktop target; 768 tablet; 375 phone.
  const DESKTOP = 1366;
  const TABLET = 768;
  const PHONE = 375;

  await viewport(DESKTOP, 1000, false);

  // Login screens (before establishing a demo session).
  for (const lang of ['ar', 'en']) {
    await navigate(`${BASE}/login?lang=${lang}`);
    await capture(`login-${lang}-desktop.png`, DESKTOP, 1000, false);
  }
  await navigate(`${BASE}/login?lang=ar`);
  await capture('login-ar-mobile.png', PHONE, 844, true);

  // One-click guest sign-in, real route.
  await navigate(`${BASE}/login?lang=ar`);
  const login = await evaluate(
    `fetch('/api/auth/demo', { method: 'POST', credentials: 'same-origin' }).then(async (r) => ({ status: r.status, body: await r.json() }))`,
    true,
  );
  if (login.status !== 200) throw new Error(`demo login failed: ${JSON.stringify(login)}`);

  const pages = [
    ['admin-overview', '/admin'],
    ['admin-monitors', '/admin/monitors'],
    ['admin-incidents', '/admin/incidents'],
    ['admin-maintenance', '/admin/maintenance'],
    ['admin-activity', '/admin/activity'],
    ['admin-notifications', '/admin/notifications'],
    ['admin-settings', '/admin/settings'],
  ];

  const monitors = await evaluate(`fetch('/api/admin/monitors').then((r) => r.json())`, true);
  const firstId = monitors.monitors?.[0]?.id;
  if (firstId) pages.splice(2, 0, ['admin-monitor-detail', `/admin/monitors/${firstId}`]);

  const incidents = await evaluate(`fetch('/api/admin/incidents?status=all').then((r) => r.json())`, true);
  const firstIncident = incidents.incidents?.[0]?.id;
  if (firstIncident) pages.push(['admin-incident-detail', `/admin/incidents/${firstIncident}`]);

  for (const lang of ['ar', 'en']) {
    for (const [name, route] of pages) {
      await navigate(`${BASE}${route}?lang=${lang}`);
      await capture(`${name}-${lang}-desktop.png`, DESKTOP, 1000, false);
      if (name === 'admin-overview' || name === 'admin-monitors' || name === 'admin-notifications') {
        await capture(`${name}-${lang}-mobile.png`, PHONE, 844, true);
        await capture(`${name}-${lang}-tablet.png`, TABLET, 1024, true);
        if (name === 'admin-monitors' && lang === 'ar') {
          await evaluate(`document.querySelector('button[aria-expanded]')?.click()`);
          await sleep(200);
          await capture('admin-monitors-ar-filter-mobile.png', PHONE, 844, true, false);
        }
      }
    }
    await navigate(`${BASE}/?lang=${lang}`);
    await capture(`public-${lang}-desktop.png`, DESKTOP, 1000, false);
    await capture(`public-${lang}-mobile.png`, PHONE, 844, true);

    await navigate(`${BASE}/about?lang=${lang}`);
    await capture(`about-${lang}-desktop.png`, DESKTOP, 1000, false);
    await navigate(`${BASE}/help?lang=${lang}`);
    await capture(`help-${lang}-desktop.png`, DESKTOP, 1000, false);
  }

  // Light admin theme (dark is the default).
  await evaluate(`localStorage.setItem('sp_theme', 'light')`);
  await navigate(`${BASE}/admin?lang=en`);
  await capture('admin-overview-light-en-desktop.png', DESKTOP, 1000, false);
  await evaluate(`localStorage.setItem('sp_theme', 'dark')`);

  // Sidebar/drawer breakpoints requested by review.
  for (const [width, height, mobile] of [
    [1024, 800, false],
    [1280, 800, false],
    [768, 1024, true],
    [375, 844, true],
  ]) {
    await navigate(`${BASE}/admin/monitors?lang=ar`);
    await viewport(width, height, mobile);
    await sleep(300);
    await checkOverflow(`admin-monitors-${width}`, width);
  }

  if (overflow.length > 0) {
    throw new Error(`Horizontal overflow detected:\n${overflow.join('\n')}`);
  }
  console.log('All screenshots captured with no horizontal overflow.');
} finally {
  try {
    socket.close();
  } catch {
    // Ignore close failures.
  }
  chrome.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold a lock; the temp folder is disposable.
  }
}
