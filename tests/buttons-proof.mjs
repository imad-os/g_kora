// Browser proof (1.4.1): controller A = Select, B = Back (never Track), X = Track, Y = Favorite; hints say the same.
// A fake standard gamepad (navigator.getGamepads), every outside host answered locally.
// Run: node tests/buttons-proof.mjs [shots dir]  (Playwright + ../g checkout)
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
const fx = (id, home, hid, away, aid, league, lid, status, gh, ga, hour) => ({
  fixture: { id, date: `${ymd}T${hour}:00:00+00:00`, timestamp: 0, venue: { name: 'Stadium', city: 'City' }, status: { short: status, long: status, elapsed: status === '2H' ? 67 : null } },
  league: { id: lid, name: league, country: 'World', logo: '', season: 2026, round: 'Round 1' },
  teams: { home: { id: hid, name: home, logo: '' }, away: { id: aid, name: away, logo: '' } },
  goals: { home: gh, away: ga }, score: { halftime: { home: gh, away: ga }, fulltime: { home: gh, away: ga }, extratime: { home: null, away: null }, penalty: { home: null, away: null } }
});
const fixtures = { get: 'fixtures', errors: [], results: 4, paging: { current: 1, total: 1 }, response: [
  fx(9001, 'Real Madrid', 541, 'Barcelona', 529, 'La Liga', 140, '2H', 2, 1, '20'),
  fx(9002, 'Manchester City', 50, 'Arsenal', 42, 'Premier League', 39, 'NS', null, null, '21'),
  fx(9003, 'Paris Saint Germain', 85, 'AC Milan', 489, 'UEFA Champions League', 2, 'FT', 3, 0, '18'),
  fx(9004, 'Lyon', 80, 'Marseille', 81, 'Ligue 1', 61, 'NS', null, null, '22')
] };

// --- fake bridge document (Firestore REST shape). Starts like a TV on 1.3.3 left it: no change stamp,
// match 9002 tracked on the TV, plus another profile that must never leak in.
const legacyTv = { username: 'player', updatedAt: Date.now() - 3600e3, tracked_matches: [9002],
  favorite_teams: [{ id: 50, name: 'Manchester City' }, { id: 976, name: 'Raja Casablanca' }], favorite_leagues: [], favorite_players: [] };
const other = { username: 'sara', changedAt: Date.now() + 9e9, tracked_matches: [9004], favorite_teams: [{ id: 33, name: 'Manchester United' }] };
let doc = { fields: { profiles: { mapValue: { fields: {
  player: { stringValue: JSON.stringify(legacyTv) }, sara: { stringValue: JSON.stringify(other) } } } },
  latestConfigJson: { stringValue: JSON.stringify(other) } } };
const io = { get: 0, patch: 0 };
const bridgeEntry = () => JSON.parse(doc.fields.profiles.mapValue.fields.player.stringValue);

async function route(r) {
  const req = r.request(), url = req.url();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  const json = (o) => r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
  if (url.includes('identitytoolkit.googleapis.com')) return json({ idToken: 'fake-token', expiresIn: '3600' });
  if (url.includes('firestore.googleapis.com') && url.includes('/usersSettings/')) {
    if (req.method() === 'GET') { io.get++; return json(doc); }
    if (req.method() === 'PATCH') { io.patch++; doc = { fields: JSON.parse(req.postData()).fields }; return json(doc); }
  }
  if (url.includes('footballRequest') || (/api-sports\.io\//.test(url) && !url.includes('media.'))) {
    if (/fixtures(\?|&|%3F|$)|endpoint=fixtures(&|$)/.test(url) && !/id=900/.test(url)) return json(fixtures);
    if (/id=9004/.test(url)) return json({ ...fixtures, response: [fixtures.response[3]] });
    return json({ get: '', errors: [], results: 0, paging: { current: 1, total: 1 }, response: [] });
  }
  if (url.endsWith('/sdk/mypc-sdk.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(SDK) });
  const hosted = url.match(/^https:\/\/(?:pc\.geekspro\.us|imad-os\.github\.io\/g)\/([^?#]+)/);
  const local = hosted && path.resolve(path.dirname(SDK), '..', hosted[1]);
  if (local && fs.existsSync(local)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(local) });
  return r.fulfill({ status: 404, headers: cors, body: '' });
}


const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, route);
await ctx.addInitScript(() => {
  const pad = { id: 'Fake standard pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  navigator.getGamepads = () => [pad, null, null, null];
  window.__press = (i, on) => { pad.buttons[i].pressed = on; pad.buttons[i].value = on ? 1 : 0; pad.timestamp++; };
  window.addEventListener('load', () => window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad })));
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
let ok = true;
const check = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : ' -> ' + JSON.stringify(info))); if (!cond) ok = false; };
const press = async (i) => { await page.evaluate(i => window.__press(i, true), i); await page.waitForTimeout(150); await page.evaluate(i => window.__press(i, false), i); await page.waitForTimeout(450); };
const tracked = () => page.evaluate(() => [...window.AppState.monitoredMatches].sort());
const favs = () => page.evaluate(() => window.AppServices.State.appConfig.favorite_teams.map(t => t.id));
const focusCard = (id) => page.evaluate(id => window.Navigation.focus(document.querySelector('#match-card-' + id)), id);

await page.goto(BASE + 'index.html');
await page.waitForSelector('#match-card-9004', { timeout: 15000 });
await page.waitForTimeout(800);
const hints = await page.locator('.hud-hint').allInnerTexts();
check('hints: A Select, B Back', /^A\s+Select$/.test(hints[0].trim()) && /^B\s+Back$/.test(hints[1].trim()), hints);
const touch = JSON.parse(fs.readFileSync(path.join(ROOT, 'mypc-app.json'), 'utf8')).touch.buttons;
check('touch pad: A right = ok, B bottom = cancel', touch.some(b => b.label === 'A' && b.place === 'right' && b.action === 'ok') && touch.some(b => b.label === 'B' && b.place === 'bottom' && b.action === 'cancel'));

await focusCard(9004);
await press(1);   // B
check('B does not track the match', !(await tracked()).includes(9004), await tracked());
await focusCard(9004);
await press(2);   // X
check('X tracks the match (once)', (await tracked()).includes(9004), await tracked());
const before = (await favs()).length;
await focusCard(9004);
await press(3);   // Y
check('Y adds a favorite, does not track/untrack', (await favs()).length > before && (await tracked()).includes(9004), [await favs(), await tracked()]);
await focusCard(9004);
await page.screenshot({ path: path.join(SHOTS, 'buttons-1-home-hints.png') });
await press(0);   // A
await page.waitForTimeout(800);
const route1 = await page.evaluate(() => JSON.stringify(window.AppRouter.current));
check('A opens the match', /match/.test(route1) && /9004/.test(route1), route1);
await page.screenshot({ path: path.join(SHOTS, 'buttons-2-a-opened-match.png') });
await press(1);   // B
await page.waitForTimeout(800);
const route2 = await page.evaluate(() => JSON.stringify(window.AppRouter.current));
check('B goes back', !/9004/.test(route2), route2);
check('B on the way back did not untrack', (await tracked()).includes(9004));

await browser.close(); server.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
