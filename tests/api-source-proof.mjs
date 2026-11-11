// Browser proof of Settings > Football Data Source (Wrapped API / Direct football-api).
// Every outside host is answered locally: the Firebase function and API-Football return
// fake fixtures, and the test counts which one the app asked.
// Run: node tests/api-source-proof.mjs [shots dir]   (needs Playwright + Chromium)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOTS = process.argv[2] || path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const SDK = process.env.MYPC_SDK || path.resolve(ROOT, '../g/sdk/mypc-sdk.js');

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' }[path.extname(p)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const today = new Date();
const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const fx = (id, home, hid, away, aid, league, lid, status, gh, ga, hour, tag) => ({
  fixture: { id, date: `${ymd}T${hour}:00:00+00:00`, timestamp: 0, venue: { name: 'Stadium', city: 'City' }, status: { short: status, long: status, elapsed: status === '2H' ? 67 : null } },
  league: { id: lid, name: league + tag, country: 'World', logo: '', season: 2026, round: 'Round 1' },
  teams: { home: { id: hid, name: home, logo: '' }, away: { id: aid, name: away, logo: '' } },
  goals: { home: gh, away: ga }, score: { halftime: { home: gh, away: ga }, fulltime: { home: gh, away: ga }, extratime: { home: null, away: null }, penalty: { home: null, away: null } }
});
const fixtures = (tag) => ({ get: 'fixtures', errors: [], results: 3, paging: { current: 1, total: 1 }, response: [
  fx(9001, 'Real Madrid', 541, 'Barcelona', 529, 'La Liga', 140, '2H', 2, 1, '20', tag),
  fx(9002, 'Manchester City', 50, 'Arsenal', 42, 'Premier League', 39, 'NS', null, null, '21', tag),
  fx(9003, 'Paris Saint Germain', 85, 'AC Milan', 489, 'UEFA Champions League', 2, 'FT', 3, 0, '18', tag)
] });

const hits = { wrapped: [], direct: [] };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.log('pageerror:', e.message));
if (process.env.DEBUG) page.on('console', m => m.type() === 'error' && console.log('console:', m.text()));
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
  const url = route.request().url();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (url.includes('cloudfunctions.net/footballRequest')) {
    hits.wrapped.push(url);
    if (process.env.WRAP_DOWN) return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ CAI: 0, REC: 3, get: 'fixtures', errors: { requests: 'You have reached the request limit for the day, Go to https://dashboard.api-football.com to upgrade your plan.' }, results: 0, response: [] }) });
    return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ CAI: 0, REC: 0, ...fixtures(' · via Wrapped API') }) });
  }
  if (/api-football|api-sports\.io\//.test(url) && !url.includes('media.api-sports.io')) {
    hits.direct.push(url);
    return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(fixtures(' · via Direct API')) });
  }
  if (url.endsWith('/sdk/mypc-sdk.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(SDK) });
  // The standalone SDK loads My PC's own core files (MyPC.net...) from the hosted site: serve the local checkout.
  const hosted = url.match(/^https:\/\/(?:pc\.geekspro\.us|imad-os\.github\.io\/g)\/([^?#]+)/);
  const local = hosted && path.resolve(path.dirname(SDK), '..', hosted[1]);
  if (local && fs.existsSync(local)) return route.fulfill({ status: 200, contentType: local.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', body: fs.readFileSync(local) });
  if (process.env.DEBUG) console.log('404', url);
  return route.fulfill({ status: 404, headers: cors, body: '' });
});

const settle = () => page.waitForTimeout(1500);
const count = () => ({ wrapped: hits.wrapped.length, direct: hits.direct.length });
let ok = true;
const check = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) ok = false; };

await page.goto(BASE + 'index.html');
await settle();
const first = count();
if (process.env.WRAP_DOWN) {
  // The wrapper answers with an API-Football error: the app shows it, never quietly uses the other source.
  check('wrapper error: API-Football NOT asked (no silent fallback)', first.wrapped > 0 && first.direct === 0);
  const errText = await page.locator('.page-error').innerText().catch(() => '');
  check('wrapper error shown on the page with its source', /Wrapped API: You have reached the request limit/.test(errText));
  check('badge says Wrapped API, in red', await page.locator('#api-source-badge.has-error').innerText() === 'Wrapped API');
  await page.screenshot({ path: path.join(SHOTS, '5-wrapper-error.png') });
  await page.evaluate(() => window.AppRouter.go('settings'));
  await settle();
  await page.locator('#section-api-source').scrollIntoViewIfNeeded();
  check('settings shows the last error', /Last request failed: You have reached/.test(await page.locator('#api-source-status').innerText()));
  await page.screenshot({ path: path.join(SHOTS, '6-settings-error.png') });
  const widget = (await import(path.join(ROOT, 'widgets/scores.js'))).default;
  const out = await widget({ config: {}, state: {}, lang: 'en', now: Date.now(), fetch: async (url) => {
    if (url.includes('identitytoolkit')) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ errors: { requests: 'You have reached the request limit for the day' }, response: [] }) };
  } });
  check('widget shows the error and the source: ' + out.view.title + ' / ' + out.view.text, out.view.title.includes('Wrapped API') && /request limit/.test(out.view.text));
  await browser.close(); server.close();
  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
}
check('default source is Wrapped API (function asked, API-Football not)', first.wrapped > 0 && first.direct === 0);
console.log('  wrapped url:', hits.wrapped[0]);
check('wrapped request carries endpoint + params', /endpoint=fixtures/.test(hits.wrapped[0] || ''));
check('badge says Wrapped API', await page.locator('#api-source-badge').innerText() === 'Wrapped API');
await page.screenshot({ path: path.join(SHOTS, '1-home-wrapped.png') });

await page.evaluate(() => window.AppRouter.go('settings'));
await settle();
const sec = page.locator('#section-api-source');
await sec.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(SHOTS, '2-settings-wrapped.png') });

await page.click('.api-source-pill[data-api-source="direct"]');
await settle();
check('setting saved as direct', await page.evaluate(() => window.AppServices.State.appConfig.apiSource) === 'direct');
check('Direct pill shown active', await page.locator('.api-source-pill[data-api-source="direct"].active').count() === 1);
await page.locator('#section-api-source').scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(SHOTS, '3-settings-direct.png') });

const before = count();
await page.evaluate(() => window.AppRouter.go('home'));
await settle();
const after = count();
check('with Direct, API-Football asked and the function not', after.direct > before.direct && after.wrapped === before.wrapped);
check('badge says Direct football-api', await page.locator('#api-source-badge').innerText() === 'Direct football-api');
await page.screenshot({ path: path.join(SHOTS, '4-home-direct.png') });

await page.reload();
await settle();
check('choice kept after restart', await page.evaluate(() => window.AppServices.State.appConfig.apiSource) === 'direct');

await page.evaluate(() => window.AppRouter.go('settings'));
await settle();
await page.click('.api-source-pill[data-api-source="wrapped"]');
await settle();
const b2 = count();
await page.evaluate(() => window.AppRouter.go('home'));
await settle();
const a2 = count();
check('back to Wrapped API: the function is asked again', a2.wrapped > b2.wrapped && a2.direct === b2.direct);

// Widget + service workers follow the same setting
const widget = (await import(path.join(ROOT, 'widgets/scores.js'))).default;
const service = (await import(path.join(ROOT, 'services/notify.js'))).default;
for (const src of ['wrapped', 'direct']) {
  const asked = [];
  const ctxFetch = async (url) => {
    asked.push(url);
    if (url.includes('identitytoolkit')) return { ok: true, json: async () => ({ idToken: 't', localId: 'u' }) };
    if (url.includes('firestore.googleapis')) return { ok: true, json: async () => ({ fields: { latestConfigJson: { stringValue: JSON.stringify({ apiSource: src, favorite_teams: [{ id: 541, name: 'Real Madrid' }], tracked_matches: [9001], updatedAt: 1, widgetSettings: { mode: 'both', sources: { tracked_matches: true, favorite_teams: true }, priority: ['tracked_matches', 'favorite_teams'] }, serviceSettings: { mode: 'both', sources: { tracked_matches: true, favorite_teams: true }, priority: ['tracked_matches', 'favorite_teams'] } }) } } }) };
    return { ok: true, json: async () => fixtures('') };
  };
  await widget({ fetch: ctxFetch, config: {}, state: {}, lang: 'en', now: Date.now() });
  await service({ fetch: ctxFetch, config: {}, state: {}, lang: 'en', now: Date.now() });
  const w = asked.filter(u => u.includes('footballRequest')).length, d = asked.filter(u => u.includes('api-football-v1')).length;
  check(`widget + service with ${src}: ${src === 'wrapped' ? 'function only' : 'API-Football only'} (function ${w}, direct ${d})`, src === 'wrapped' ? (w === 2 && d === 0) : (w === 0 && d === 2));
}

await browser.close(); server.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
