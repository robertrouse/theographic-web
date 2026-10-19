// Screenshots of the design reference pages (docs/DESIGN-WORKFLOW.md) at
// phone and desktop widths, light and dark, for before/after review in a PR.
//
//   node scripts/shots.mjs <base-url> <label> [--only=gen-1,david]
//   node scripts/shots.mjs https://v2--theographic.netlify.app before
//   node scripts/shots.mjs https://deploy-preview-123--theographic.netlify.app after
//   node scripts/shots.mjs https://viz.bible vizbible --set=vizbible
//
// Writes shots/<label>/<page>-<width>-<scheme>.png (gitignored). Drives the
// local Chrome over the DevTools protocol with Node's built-in WebSocket, so
// there is nothing to install; set CHROME=/path/to/chrome if it is elsewhere.
// Full-page captures are capped at 4000 CSS px tall (Ps 119 would be ~40k).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SETS = {
  theographic: [
    ['home', '/'],
    ['david', '/person/david_994/'],
    ['jesus', '/person/jesus_904/'],
    ['bethlehem', '/place/bethlehem_218/'],
    ['eden', '/place/eden_354/'],
    ['crucifixion', '/event/crucifixion_and_burial_459/'],
    ['exodus', '/event/exodus_from_egypt_125/'],
    ['creation', '/period/creation_of_all_things_1/'],
    ['ps-119', '/ps/119/'],
    ['gen-1', '/gen/1/'],
    ['q-paul', '/?q=Paul'],
    ['q-john-debug', '/?q=John&debug=1'],
    ['browse', '/browse/'],
  ],
  vizbible: [
    ['home', '/'],
    ['bible-data', '/bible-data/'],
    ['about', '/about/'],
  ],
};
const VIEWPORTS = [
  { width: 375, height: 812, scale: 2, mobile: true },
  { width: 1280, height: 900, scale: 1, mobile: false },
];
const SCHEMES = ['light', 'dark'];
const MAX_HEIGHT = 4000;

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')),
);
const [baseArg, label] = args.filter((a) => !a.startsWith('--'));
if (!baseArg || !label) {
  console.error('usage: node scripts/shots.mjs <base-url> <label> [--set=vizbible] [--only=a,b]');
  process.exit(2);
}
const base = baseArg.replace(/\/$/, '');
let pages = SETS[flags.set ?? 'theographic'];
if (!pages) throw new Error(`unknown --set ${flags.set}`);
if (flags.only) pages = pages.filter(([name]) => flags.only.split(',').includes(name));

const chromePath =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = new URL(`../shots/${label}/`, import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- chrome
const profile = mkdtempSync(join(tmpdir(), 'shots-'));
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
    if (m) resolve(m[1]);
  });
  chrome.on('exit', (code) => reject(new Error(`chrome exited ${code}\n${buf}`)));
});

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 1;
const pending = new Map();
const waiters = [];
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) {
    for (const w of [...waiters]) {
      if (w.method === msg.method && w.sessionId === msg.sessionId) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg.params);
      }
    }
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
const once = (method, sessionId, ms = 30000) =>
  Promise.race([
    new Promise((resolve) => waiters.push({ method, sessionId, resolve })),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout: ${method}`)), ms)),
  ]);

// ----------------------------------------------------------------- shoot
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (method, params) => send(method, params, sessionId);
await s('Page.enable');

let failures = 0;
for (const vp of VIEWPORTS) {
  await s('Emulation.setDeviceMetricsOverride', {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: vp.scale,
    mobile: vp.mobile,
  });
  for (const scheme of SCHEMES) {
    await s('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: scheme }],
    });
    for (const [name, path] of pages) {
      const file = `${name}-${vp.width}-${scheme}.png`;
      try {
        const loaded = once('Page.loadEventFired', sessionId);
        await s('Page.navigate', { url: base + path });
        await loaded;
        // Fonts, the search worker and map tiles settle after load.
        await s('Runtime.evaluate', {
          expression: 'document.fonts.ready.then(() => new Promise(r => setTimeout(r, 1500)))',
          awaitPromise: true,
        });
        const { cssContentSize } = await s('Page.getLayoutMetrics');
        const height = Math.min(Math.ceil(cssContentSize.height), MAX_HEIGHT);
        // Grow the viewport to the page instead of capturing beyond it, so
        // fixed elements (the phone bottom nav) sit at the bottom of the shot
        // rather than one screen down.
        await s('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: Math.max(height, vp.height),
          deviceScaleFactor: vp.scale,
          mobile: vp.mobile,
        });
        await s('Runtime.evaluate', {
          expression: 'new Promise(r => setTimeout(r, 300))',
          awaitPromise: true,
        });
        const { data } = await s('Page.captureScreenshot', {
          format: 'png',
          clip: { x: 0, y: 0, width: vp.width, height, scale: 1 },
        });
        await s('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: vp.scale,
          mobile: vp.mobile,
        });
        writeFileSync(outDir + file, Buffer.from(data, 'base64'));
        console.log(`ok   ${file}`);
      } catch (err) {
        failures++;
        console.log(`FAIL ${file}  ${err.message}`);
      }
    }
  }
}

ws.close();
const exited = new Promise((r) => chrome.once('exit', r));
chrome.kill();
await exited; // Chrome is still flushing its cache dir until it exits
rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
console.log(`\n${outDir}`);
process.exit(failures ? 1 : 0);
