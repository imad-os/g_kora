// The desktop widget lists up to 3 matches from every enabled source (tracked + favorite teams together).
// Run: node tests/widget-proof.mjs
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const widget = (await import(path.join(ROOT, 'widgets/scores.js'))).default;
const day = new Date().toISOString().slice(0, 10);
const fx = (id, hid, aid, lid, status, gh, ga, hour, el) => ({
  fixture: { id, date: `${day}T${hour}:00:00+00:00`, status: { short: status, elapsed: el || null } },
  league: { id: lid, name: 'L' + lid, logo: `https://media.api-sports.io/football/leagues/${lid}.png` },
  teams: { home: { id: hid, name: 'T' + hid, logo: `https://media.api-sports.io/football/teams/${hid}.png` }, away: { id: aid, name: 'T' + aid, logo: `https://media.api-sports.io/football/teams/${aid}.png` } },
  goals: { home: gh, away: ga }
});
const list = [fx(1, 31, 1505, 36, 'NS', null, null, '20'), fx(2, 541, 529, 140, '2H', 2, 1, '18', 67), fx(3, 50, 42, 39, 'NS', null, null, '21'), fx(4, 85, 489, 2, 'FT', 3, 0, '12'), fx(5, 541, 1, 140, 'NS', null, null, '22')];
let ok = true;
const check = (n, c, info) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(info))); if (!c) ok = false; };
async function run(cfg) {
  const ctxFetch = async (url) => {
    if (url.includes('identitytoolkit')) return { ok: true, json: async () => ({ idToken: 't', localId: 'u' }) };
    if (url.includes('firestore.googleapis')) return { ok: true, json: async () => ({ fields: { latestConfigJson: { stringValue: JSON.stringify(Object.assign({ updatedAt: 1,
      widgetSettings: { mode: 'both', sources: { tracked_matches: true, favorite_teams: true }, priority: ['tracked_matches', 'favorite_teams'] } }, cfg)) } } }) };
    return { ok: true, json: async () => ({ errors: [], response: list }) };
  };
  return (await widget({ fetch: ctxFetch, config: {}, state: {}, lang: 'en', now: Date.now() })).view;
}
// imad: 1 favorite team + 1 tracked match -> both
let v = await run({ tracked_matches: [1], favorite_teams: [{ id: 50, name: 'Manchester City' }] });
check('1 tracked + 1 favorite team: both matches, tracked first', v.matches && v.matches.length === 2 && v.matches[0].left.endsWith('/31.png') && v.matches[1].left.endsWith('/50.png'), v);
check('each line: competition logo, flags, score, start time', v.matches && v.matches[0].icon.endsWith('/leagues/36.png') && v.matches[0].right.endsWith('/1505.png') && v.matches[0].score === '0 - 0' && /^\d\d:\d\d$/.test(v.matches[0].info), v.matches);
// a favorite with 2 matches + tracked -> 3 max, live shows the minute and the score
v = await run({ tracked_matches: [1], favorite_teams: [{ id: 541, name: 'Real Madrid' }, { id: 50, name: 'Manchester City' }] });
check('at most 3 matches', v.matches && v.matches.length === 3, v);
check("a live match shows its score and minute", v.matches && v.matches.some((m) => m.score === '2 - 1' && m.info === "67'"), v.matches);
// only one match -> the big single-match card stays
v = await run({ tracked_matches: [1], favorite_teams: [] });
check('one match: the big card (competition, flags + score, start time)', !v.matches && v.versus && v.icon.endsWith('/leagues/36.png') && v.big === '0 - 0', v);
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
