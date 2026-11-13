// Browser proof: favorites and tracked matches follow the user between devices (1.4.0).
// Two browsers = "TV" and "PC" (separate storage), one fake Firestore bridge document shared by both,
// every outside host answered locally. Run: node tests/sync-proof.mjs [shots dir]  (Playwright + ../g checkout)
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
  if (url.includes('footballRequest') || (/api-sports\.io\//.test(url) && !url.includes('media.'))) return json(fixtures);
  if (url.endsWith('/sdk/mypc-sdk.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(SDK) });
  const hosted = url.match(/^https:\/\/(?:pc\.geekspro\.us|imad-os\.github\.io\/g)\/([^?#]+)/);
  const local = hosted && path.resolve(path.dirname(SDK), '..', hosted[1]);
  if (local && fs.existsSync(local)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(local) });
  return r.fulfill({ status: 404, headers: cors, body: '' });
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function device(name, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, route);
  if (seed) await ctx.addInitScript((s) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); for (const k in s) localStorage.setItem(k, s[k]); } }, seed);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(name, 'pageerror:', e.message));
  page.dev = name;
  return page;
}
const open = async (p) => { await p.goto(BASE + 'index.html'); await p.waitForSelector('#match-card-9001', { timeout: 15000 }); await p.waitForTimeout(800); };
const tracked = (p) => p.evaluate(() => [...window.AppState.monitoredMatches].sort());
const favs = (p) => p.evaluate(() => window.AppServices.State.appConfig.favorite_teams.map(t => t.id).sort((a, b) => a - b));
const dots = (p) => p.evaluate(() => [...new Set([...document.querySelectorAll('.match-card .track-indicator')].map(d => +d.closest('.match-card').dataset.id))].sort());
let ok = true;
const check = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : ' -> ' + JSON.stringify(info))); if (!cond) ok = false; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The PC already had its own (1.3.3) saved data: match 9001 tracked, other favorites
const pcOld = { tracked_matches: [9001], favorite_teams: [{ id: 541, name: 'Real Madrid' }], favorite_leagues: [], favorite_players: [] };
const pc = await device('PC', { ['mypc_/index.html']: JSON.stringify({ appConfig: pcOld, tracked_matches: [9001] }) });
const tv = await device('TV');

// 1. first start after the update: the PC gets the TV's tracked match (nothing is lost on either side)
await open(pc);
check('PC: TV match 9002 + own 9001 tracked after update', eq(await tracked(pc), [9001, 9002]));
check('PC: red dots on 9001 and 9002', eq(await dots(pc), [9001, 9002]), await dots(pc));
check('PC: favorites put together (Real Madrid + TV ones)', eq(await favs(pc), [50, 541, 976]));
check("PC: another profile's data never comes in", !(await tracked(pc)).includes(9004));
check('bridge: stamped copy written', Number(bridgeEntry().changedAt) > 0 && eq(bridgeEntry().tracked_matches, [9001, 9002]));
await pc.screenshot({ path: path.join(SHOTS, 'sync-1-pc-after-update.png') });

// 2. the TV tracks 9004 with the remote (focus the card, X = Track) -> the PC sees it when reopened
await open(tv);
check('TV: same list as the PC', eq(await tracked(tv), [9001, 9002]));
await tv.evaluate(() => window.Navigation.focus(document.querySelector('#match-card-9004')));
await tv.keyboard.press('x');
await tv.waitForTimeout(600);
check('TV: 9004 tracked by the X button', eq(await tracked(tv), [9001, 9002, 9004]));
check('TV: saved in My PC user data', await tv.evaluate(() => MyPC.load('appConfig').tracked_matches.includes(9004)));
await tv.screenshot({ path: path.join(SHOTS, 'sync-2-tv-tracks-9004.png') });
await open(pc);
check('PC reopened: 9004 tracked too', eq(await tracked(pc), [9001, 9002, 9004]), [await tracked(pc), bridgeEntry()]);
await pc.screenshot({ path: path.join(SHOTS, 'sync-3-pc-sees-9004.png') });

// 3. PC untracks 9001 and adds a favorite -> TV (still open) picks it up when shown again
await pc.evaluate(() => window.Utils.toggleTrackVisual(9001));
await pc.evaluate(() => window.AppServices.FavoritesService.add('team', { id: 157, name: 'Bayern Munich' }));
await pc.waitForTimeout(500);
await tv.evaluate(() => window.AppServices.Storage.refreshFromBridge(true));
await tv.waitForTimeout(800);
check('TV (open): 9001 untracked from the PC', eq(await tracked(tv), [9002, 9004]), [await tracked(tv), bridgeEntry().tracked_matches]);
check('TV (open): red dots follow', eq(await dots(tv), [9002, 9004]));
check('TV (open): Bayern favorite from the PC', (await favs(tv)).includes(157));
await tv.screenshot({ path: path.join(SHOTS, 'sync-4-tv-after-pc-change.png') });

// 4. Firestore cost: reopening with nothing changed writes nothing
const before = io.patch;
await open(tv);
await tv.evaluate(() => window.AppServices.Storage.syncToWidgetServiceBridge());
check('no write when nothing changed', io.patch === before);
console.log('bridge reads', io.get, 'writes', io.patch);

await browser.close(); server.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
