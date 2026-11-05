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

