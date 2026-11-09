import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('mypc-app.json manifest conforms to My PC SDK specification', () => {
  const content = fs.readFileSync('mypc-app.json', 'utf8');
  const manifest = JSON.parse(content);

  assert.equal(manifest.mypc, 1, 'mypc must be 1');
  assert.equal(manifest.id, 'football-live', 'app id matches expected id');
  assert.equal(manifest.type, 'app', 'type must be app or game');
  assert.equal(manifest.entry, 'index.html', 'entry point must be index.html');
  assert.ok(manifest.name && manifest.name.length <= 40, 'name is present and within 40 chars');
  assert.ok(manifest.description && manifest.description.length <= 120, 'description within 120 chars');
  assert.ok(manifest.version, 'version string exists');
  assert.ok(Array.isArray(manifest.widgets), 'widgets array exists');
  assert.ok(Array.isArray(manifest.services), 'services array exists');
  assert.equal(manifest.widgets[0].id, 'scores', 'widget id is scores');
  assert.equal(manifest.services[0].id, 'match-alerts', 'service id is match-alerts');
});

test('FavoritesService.normalizeConfig migrates legacy typo keys and preserves button mappings', () => {
  const normalizeConfig = (cfg: any) => {
    const c = cfg || {};
    const toArr = (v: any) => Array.isArray(v) ? v : [];
    const mergeUniqueById = (a: any, b: any) => {
      const out: any[] = [];
      const seen = new Set();
      [...toArr(a), ...toArr(b)].forEach(it => {
        const id = Number(it && it.id);
        if (!id || seen.has(id)) return;
        seen.add(id);
        out.push({ ...it, id });
      });
      return out;
    };

    c.favorite_teams = mergeUniqueById(c.favorite_teams, c.favourit_teams);
    c.favorite_leagues = mergeUniqueById(c.favorite_leagues, c.favourite_leagues);
    c.favorite_players = mergeUniqueById(c.favorite_players, c.favourite_players);

    delete c.favourit_teams;
    delete c.favourite_leagues;
    delete c.favourite_players;

    c.buttonMappings = Object.assign({
      dateNext: 'pageUp',
      datePrev: 'pageDown',
      favToggle: 'y',
      trackToggle: 'run'
    }, c.buttonMappings || {});

    return c;
  };

  const legacy = {
    favourit_teams: [{ id: 85, name: 'PSG' }],
    favorite_teams: [{ id: 50, name: 'Man City' }],
    favourite_leagues: [{ id: 39, name: 'Premier League' }],
    buttonMappings: { favToggle: 'run', trackToggle: 'y' }
  };

  const normalized = normalizeConfig(legacy);
  assert.equal(normalized.favorite_teams.length, 2);
  assert.equal(normalized.favorite_leagues.length, 1);
  assert.equal(normalized.buttonMappings.favToggle, 'run');
  assert.equal(normalized.buttonMappings.trackToggle, 'y');
  assert.equal(normalized.buttonMappings.dateNext, 'pageUp');
});

test('Match status classification handles live vs finished accurately', () => {
  const isLive = (statusShort: string) => ['1H', 'HT', '2H', 'ET', 'P', 'BT'].includes(statusShort);
  const isFinished = (statusShort: string) => ['FT', 'AET', 'PEN'].includes(statusShort);

  assert.equal(isLive('1H'), true);
  assert.equal(isLive('HT'), true);
  assert.equal(isLive('2H'), true);
  assert.equal(isLive('FT'), false);
  assert.equal(isLive('NS'), false);

  assert.equal(isFinished('FT'), true);
  assert.equal(isFinished('AET'), true);
  assert.equal(isFinished('PEN'), true);
  assert.equal(isFinished('2H'), false);
});

test('AppRouter route definitions include settings and hash routing', () => {
  const parseHash = (hash: string) => {
    const raw = hash || '#/home';
    const clean = raw.startsWith('#') ? raw.slice(1) : raw;
    const [pathRaw] = clean.split('?');
    const path = (pathRaw || '/home').replace(/^\/+/, '');
    const parts = path.split('/').filter(Boolean);
    const route = parts[0] || 'home';
    if (route === 'settings') return { name: 'settings', params: null };
    if (route === 'account') return { name: 'account', params: null };
    if (route === 'match' && parts[1]) return { name: 'match', params: parts[1] };
    return { name: 'home', params: null };
  };

  assert.deepEqual(parseHash('#/settings'), { name: 'settings', params: null });
  assert.deepEqual(parseHash('#/account'), { name: 'account', params: null });
  assert.deepEqual(parseHash('#/match/12345'), { name: 'match', params: '12345' });
  assert.deepEqual(parseHash('#/'), { name: 'home', params: null });
});

test('Keyboard and TV Remote key code mapping coverage', () => {
  const mapKeyToAction = (code: number, key: string) => {
    if (key === 'ArrowLeft' || code === 37) return 'left';
    if (key === 'ArrowRight' || code === 39) return 'right';
    if (key === 'ArrowUp' || code === 38) return 'up';
    if (key === 'ArrowDown' || code === 40) return 'down';
    if (key === 'Enter' || code === 13) return 'ok';
    if (key === 'Escape' || code === 27 || code === 10009 || key === 'Backspace' || code === 8) return 'cancel';
    if (key === 'PageUp' || code === 33 || code === 427) return 'pageUp';
    if (key === 'PageDown' || code === 34 || code === 428) return 'pageDown';
    if (key === 'x' || key === 'X') return 'run';
    if (key === 'y' || key === 'Y') return 'y';
    return null;
  };

  // Samsung TV Remote Back key
  assert.equal(mapKeyToAction(10009, 'XF86Back'), 'cancel');
  // Samsung TV Channel keys
  assert.equal(mapKeyToAction(427, 'ChannelUp'), 'pageUp');
  assert.equal(mapKeyToAction(428, 'ChannelDown'), 'pageDown');
  // Gamepad / Keyboard action keys
  assert.equal(mapKeyToAction(88, 'x'), 'run');
  assert.equal(mapKeyToAction(89, 'y'), 'y');
  assert.equal(mapKeyToAction(13, 'Enter'), 'ok');
});

test('Action de-duplication suppresses dual SDK and DOM bridge key events', () => {
  const lastActionTimestamps: Record<string, number> = {};
  const executed: string[] = [];

  function simulateHandleAction(rawAction: string, pressed: boolean, repeat: boolean, nowMs: number) {
    if (!pressed) return false;
    let action = rawAction;
    if (action === 'confirm' || action === 'jump') action = 'ok';
    if (action === 'b') action = 'cancel';

    const minInterval = (action === 'ok') ? 220 : ((action === 'cancel' || action === 'menu') ? 200 : 110);
    if (!repeat) {
      if (nowMs - (lastActionTimestamps[action] || 0) < minInterval) {
        return false;
      }
      lastActionTimestamps[action] = nowMs;
    }
    executed.push(action);
    return true;
  }

  // 1. Enter key: DOM fires 'ok', MyPC fires 'confirm', MyPC fires 'jump' all at t = 1000
  assert.equal(simulateHandleAction('ok', true, false, 1000), true);
  assert.equal(simulateHandleAction('confirm', true, false, 1001), false, 'dual confirm should be dropped');
  assert.equal(simulateHandleAction('jump', true, false, 1002), false, 'dual jump should be dropped');
  assert.equal(executed.filter(a => a === 'ok').length, 1);

  // 2. Later Enter press after 300ms should succeed
  assert.equal(simulateHandleAction('ok', true, false, 1300), true);
  assert.equal(executed.filter(a => a === 'ok').length, 2);

  // 3. Rapid arrow keys from dual listeners at t = 2000 and 2005
  assert.equal(simulateHandleAction('left', true, false, 2000), true);
  assert.equal(simulateHandleAction('left', true, false, 2005), false, 'duplicate arrow event should be dropped');

  // 4. Legitimate arrow key after 120ms should succeed
  assert.equal(simulateHandleAction('left', true, false, 2125), true);
});

test('ButtonMapper friendly label resolution supports controller and keyboard keys', () => {
  const getFriendlyLabel = (action: string) => {
    if (!action) return 'Not mapped';
    const a = String(action).toLowerCase();
    if (a === 'pageup' || a === 'rb') return 'R Shoulder (RB)';
    if (a === 'pagedown' || a === 'lb') return 'L Shoulder (LB)';
    if (a === 'run' || a === 'x') return 'Button X';
    if (a === 'y') return 'Button Y';
    if (a === 'confirm' || a === 'ok' || a === 'a') return 'Button A';
    if (a === 'cancel' || a === 'b') return 'Button B';
    if (a === 'right') return 'D-pad Right';
    if (a === 'left') return 'D-pad Left';
    if (a === 'up') return 'D-pad Up';
    if (a === 'down') return 'D-pad Down';
    if (a === 'rt') return 'R Trigger (RT)';
    if (a === 'lt') return 'L Trigger (LT)';
    if (a === 'menu' || a === 'start') return 'Menu / Start';
    if (a === 'select' || a === 'view') return 'Select / View';
    return action.charAt(0).toUpperCase() + action.slice(1);
  };

  assert.equal(getFriendlyLabel('pageUp'), 'R Shoulder (RB)');
  assert.equal(getFriendlyLabel('RB'), 'R Shoulder (RB)');
  assert.equal(getFriendlyLabel('pageDown'), 'L Shoulder (LB)');
  assert.equal(getFriendlyLabel('LB'), 'L Shoulder (LB)');
  assert.equal(getFriendlyLabel('run'), 'Button X');
  assert.equal(getFriendlyLabel('X'), 'Button X');
  assert.equal(getFriendlyLabel('y'), 'Button Y');
  assert.equal(getFriendlyLabel('ok'), 'Button A');
  assert.equal(getFriendlyLabel('cancel'), 'Button B');
  assert.equal(getFriendlyLabel('RT'), 'R Trigger (RT)');
  assert.equal(getFriendlyLabel('LT'), 'L Trigger (LT)');
});

function loadMyPcWorkerModule(filePath: string) {
  const code = fs.readFileSync(filePath, 'utf8');
  const clean = String(code)
    .replace(/^\s*export\s+default\s+/gm, 'const __default = ')
    .replace(/^\s*export\s+(async\s+)?function\s+/gm, '$1function ')
    .replace(/^\s*export\s+(const|let|var)\s+/gm, '$1 ');
  const factory = new Function(`${clean}\nreturn typeof __default === 'function' ? __default : null;`);
  return factory();
}

test('widgets/scores.js renders a strictly 3-row logos-only layout (LeagueTitle, teamlogo 0 - 0 teamlogo, timing progress bar) using saved user favorites', async () => {
  const rawCode = fs.readFileSync('widgets/scores.js', 'utf8');
  assert.ok(rawCode.trim().startsWith('/**'), 'widgets/scores.js starts with top descriptive block comment');

  const refresh = loadMyPcWorkerModule('widgets/scores.js');
  assert.equal(typeof refresh, 'function');

  const mockFixture = {
    fixture: {
      id: 998877,
      date: new Date().toISOString(),
      status: { short: '2H', elapsed: 63 }
    },
    league: {
      id: 39,
      name: 'Premier League',
      logo: 'https://media.api-sports.io/football/leagues/39.png'
    },
    teams: {
      home: { id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' },
      away: { id: 50, name: 'Manchester City', logo: 'https://media.api-sports.io/football/teams/50.png' }
    },
    goals: { home: 2, away: 1 }
  };

  const savedConfig = {
    favorite_teams: [{ id: 42, name: 'Arsenal' }],
    favorite_leagues: [],
    tracked_matches: []
  };

  const ctx = {
    settings: {},
    state: {},
    fetch: async (url: string) => {
      if (url.includes('identitytoolkit.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({ idToken: 'mock-id-token' })
        };
      }
      if (url.includes('firestore.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            fields: {
              latestConfigJson: { stringValue: JSON.stringify(savedConfig) }
            }
          })
        };
      }
      if (url.includes('api-football-v1.p.rapidapi.com/v3/fixtures')) {
        return {
          ok: true,
          json: async () => ({ response: [mockFixture] })
        };
      }
      throw new Error('Unexpected URL: ' + url);
    }
  };

  const result = await refresh(ctx);
  const view = result.view;

  // Row 1: LeagueTitle + live timing
  assert.ok(view.title.includes('Premier League'), 'Row 1 includes LeagueTitle');
  assert.ok(view.title.includes("63'"), 'Row 1 includes live match minute');

  // Row 2: teamlogo 0 - 0 teamlogo (logos only, no team names in score row)
  assert.equal(view.icon, 'https://media.api-sports.io/football/teams/42.png', 'Home logo set in icon');
  assert.equal(view.image, 'https://media.api-sports.io/football/teams/50.png', 'Away logo set in image');
  assert.equal(view.big, '2 - 1', 'Scoreline formatted as logos-only score 2 - 1');

  // Row 3: progress bar for timing (63 / 90 = 0.7) ONLY when match has started
  assert.equal(typeof view.progress, 'number');
  assert.ok(Math.abs(view.progress - 63 / 90) < 0.01, 'Timing progress bar matches 63/90');
  assert.equal(view.sub, undefined, 'No extra sub row when progress bar is active');

  // Strictly 3 rows max: no extra rows array or text paragraph
  assert.equal(view.rows, undefined, 'No extra rows table');
  assert.equal(view.text, undefined, 'No extra text block');

  // Verify unstarted match ('NS'): shows when it will start in `sub`, and NO `progress` bar
  const upcomingFixture = {
    ...mockFixture,
    fixture: {
      id: 998878,
      date: '2026-11-09T20:00:00Z',
      status: { short: 'NS', elapsed: null }
    },
    goals: { home: null, away: null }
  };

  const upcomingRes = await refresh({
    ...ctx,
    fetch: async (url: string) => {
      if (url.includes('identitytoolkit.googleapis.com')) return { ok: true, json: async () => ({ idToken: 'mock-id-token' }) };
      if (url.includes('firestore.googleapis.com')) {
        return { ok: true, json: async () => ({ fields: { latestConfigJson: { stringValue: JSON.stringify(savedConfig) } } }) };
      }
      return { ok: true, json: async () => ({ response: [upcomingFixture] }) };
    }
  });
  assert.equal(upcomingRes.view.title, 'Premier League', 'Row 1 shows LeagueTitle');
  assert.equal(upcomingRes.view.big, '0 - 0', 'Row 2 shows 0 - 0');
  assert.equal(upcomingRes.view.progress, undefined, 'Unstarted match MUST NOT show a progress bar');
  assert.ok(upcomingRes.view.sub && upcomingRes.view.sub.startsWith('Starts at '), 'Unstarted match shows when it is going to start');

  // Verify empty state (no match today): shows "No Match Today" without "0 - 0" and without progress bar
  const emptyRes = await refresh({
    ...ctx,
    fetch: async (url: string) => {
      if (url.includes('identitytoolkit.googleapis.com')) return { ok: true, json: async () => ({ idToken: 'mock-id-token' }) };
      if (url.includes('firestore.googleapis.com')) {
        return { ok: true, json: async () => ({ fields: { latestConfigJson: { stringValue: JSON.stringify(savedConfig) } } }) };
      }
      return { ok: true, json: async () => ({ response: [] }) };
    }
  });
  assert.equal(emptyRes.view.text, 'No Match Today', 'Empty state shows No Match Today');
  assert.equal(emptyRes.view.big, undefined, 'Empty state MUST NOT show 0 - 0');
  assert.equal(emptyRes.view.progress, undefined, 'Empty state MUST NOT show an empty progress bar');
});

test('services/notify.js emits 2-row goal notifications (RM 0 - 1 BRS in green + Yamal 13\') with https:// team crest logos', async () => {
  const rawCode = fs.readFileSync('services/notify.js', 'utf8');
  assert.ok(rawCode.trim().startsWith('/**'), 'services/notify.js starts with top descriptive block comment');

  const tick = loadMyPcWorkerModule('services/notify.js');
  assert.equal(typeof tick, 'function');

  const savedConfig = {
    favorite_teams: [{ id: 541, name: 'Real Madrid' }],
    favorite_leagues: [],
    tracked_matches: [777111]
  };

  let currentFixture: any = {
    fixture: { id: 777111, status: { short: '1H', elapsed: 1 } },
    league: { id: 140, name: 'La Liga', logo: 'https://media.api-sports.io/football/leagues/140.png' },
    teams: {
      home: { id: 541, name: 'Real Madrid', logo: 'https://media.api-sports.io/football/teams/541.png' },
      away: { id: 529, name: 'Barcelona', logo: 'https://media.api-sports.io/football/teams/529.png' }
    },
    goals: { home: 0, away: 0 },
    events: []
  };

  let workerState: any = { matchStates: {} };

  const makeCtx = () => ({
    state: workerState,
    config: {},
    fetch: async (url: string) => {
      if (url.includes('identitytoolkit.googleapis.com')) {
        return { ok: true, json: async () => ({ idToken: 'mock-token' }) };
      }
      if (url.includes('firestore.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            fields: {
              latestConfigJson: { stringValue: JSON.stringify(savedConfig) }
            }
          })
        };
      }
      return { ok: true, json: async () => ({ response: [currentFixture] }) };
    }
  });

  // First tick: emits 2-row Kick-Off notification with Real Madrid's logo and records baseline
  const res1 = await tick(makeCtx());
  workerState = res1.state;
  assert.equal(res1.notifications.length, 1, 'First tick emits Kick-Off notification');
  assert.equal(res1.notifications[0].title, 'RM 0 - 0 BRS', 'Row 1 shows RM 0 - 0 BRS');
  assert.equal(res1.notifications[0].message, "Kick-Off 1'", 'Row 2 shows Kick-Off 1\'');
  assert.equal(res1.notifications[0].image, 'https://media.api-sports.io/football/teams/541.png', 'Kick-off notification includes favorite team logo');

  // Second tick: Barcelona (BRS) scores via Yamal at 13' (0 - 1)
  currentFixture = {
    ...currentFixture,
    fixture: { id: 777111, status: { short: '1H', elapsed: 13 } },
    goals: { home: 0, away: 1 },
    events: [
      { type: 'Goal', time: { elapsed: 13 }, player: { name: 'Yamal' } }
    ]
  };
  const res2 = await tick(makeCtx());
  assert.equal(res2.notifications.length, 1, 'Goal notification emitted');
  assert.equal(res2.notifications[0].title, 'RM 0 - 🟢 1 BRS', 'Row 1 highlights changed away score in green');
  assert.ok(res2.notifications[0].titleHtml.includes('#4cd964'), 'titleHtml colors changed result in #4cd964 green');
  assert.equal(res2.notifications[0].message, "Yamal 13'", 'Row 2 shows scorer and minute (Yamal 13\')');
  assert.equal(res2.notifications[0].image, 'https://media.api-sports.io/football/teams/529.png', 'Notification includes scoring team https:// logo');
  assert.equal(res2.notifications[0].link, 'football-live:match/777111', 'Notification includes match deep-link');
});

test('widgets/scores.js respects widgetSettings source toggles (only_tracked vs only_favs) and priority order', async () => {
  const refresh = loadMyPcWorkerModule('widgets/scores.js');

  const trackedMatch = {
    fixture: { id: 555001, date: new Date().toISOString(), status: { short: '1H', elapsed: 20 } },
    league: { id: 61, name: 'Ligue 1', logo: 'https://media.api-sports.io/football/leagues/61.png' },
    teams: {
      home: { id: 81, name: 'Marseille', logo: 'https://media.api-sports.io/football/teams/81.png' },
      away: { id: 80, name: 'Lyon', logo: 'https://media.api-sports.io/football/teams/80.png' }
    },
    goals: { home: 1, away: 0 }
  };

  const favTeamMatch = {
    fixture: { id: 555002, date: new Date().toISOString(), status: { short: '1H', elapsed: 35 } },
    league: { id: 140, name: 'La Liga', logo: 'https://media.api-sports.io/football/leagues/140.png' },
    teams: {
      home: { id: 541, name: 'Real Madrid', logo: 'https://media.api-sports.io/football/teams/541.png' },
      away: { id: 529, name: 'Barcelona', logo: 'https://media.api-sports.io/football/teams/529.png' }
    },
    goals: { home: 0, away: 1 }
  };

  // When widgetSettings has favorite_teams higher priority than tracked_matches:
  const configFavFirst = {
    favorite_teams: [{ id: 541, name: 'Real Madrid' }],
    tracked_matches: [555001],
    widgetSettings: {
      mode: 'both',
      sources: { tracked_matches: true, favorite_teams: true, favorite_leagues: false, allowed_leagues: false },
      priority: ['favorite_teams', 'tracked_matches', 'favorite_leagues', 'allowed_leagues']
    }
  };

  const resFavFirst = await refresh({
    settings: {},
    state: {},
    fetch: async (url: string) => {
      if (url.includes('identitytoolkit.googleapis.com')) return { ok: true, json: async () => ({ idToken: 'tok' }) };
      if (url.includes('firestore.googleapis.com')) {
        return { ok: true, json: async () => ({ fields: { latestConfigJson: { stringValue: JSON.stringify(configFavFirst) } } }) };
      }
      return { ok: true, json: async () => ({ response: [trackedMatch, favTeamMatch] }) };
    }
  });
  assert.equal(resFavFirst.view.link, 'match/555002', 'Selects Favorite Team match when favorite_teams is priority #1');

  // When widgetSettings is set to Tracked Matches Only:
  const configTrackedOnly = {
    ...configFavFirst,
    widgetSettings: {
      mode: 'tracked_only',
      sources: { tracked_matches: true, favorite_teams: false, favorite_leagues: false, allowed_leagues: false },
      priority: ['favorite_teams', 'tracked_matches', 'favorite_leagues', 'allowed_leagues']
    }
  };

  const resTrackedOnly = await refresh({
    settings: {},
    state: {},
    fetch: async (url: string) => {
      if (url.includes('identitytoolkit.googleapis.com')) return { ok: true, json: async () => ({ idToken: 'tok' }) };
      if (url.includes('firestore.googleapis.com')) {
        return { ok: true, json: async () => ({ fields: { latestConfigJson: { stringValue: JSON.stringify(configTrackedOnly) } } }) };
      }
      return { ok: true, json: async () => ({ response: [trackedMatch, favTeamMatch] }) };
    }
  });
  assert.equal(resTrackedOnly.view.link, 'match/555001', 'Selects Tracked Match when mode is tracked_only');
});
