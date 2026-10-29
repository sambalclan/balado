// Sambal Balado API Tracker — Hybrid activity tracking
// Bindings: DB (D1), CLAN_TAG (text), COC_API_TOKEN (secret), COC_API_BASE_URL or COC_API_BASE (text)
// Cron recommendation: */5 * * * * (UTC). Existing data and tables are preserved.
const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
  'cache-control': 'no-store',
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: HEADERS });
const routes = new Set(['/clan', '/currentwar', '/raid', '/cwl', '/activity', '/activity/events']);
const tag = value => encodeURIComponent(String(value || '').trim());
const baseUrl = env => String(env.COC_API_BASE_URL || env.COC_API_BASE || env.COC_PROXY_BASE_URL || 'https://api.clashofclans.com/v1').replace(/\/+$/, '');
const nowISO = () => new Date().toISOString();
const hashKey = (...parts) => parts.map(p => String(p ?? '')).join('|');

async function upstream(env, path) {
  if (!env.COC_API_TOKEN) throw new Error('COC_API_TOKEN is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(baseUrl(env) + path, {
      headers: { Authorization: `Bearer ${env.COC_API_TOKEN}`, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally { clearTimeout(timeout); }
}
async function readUpstream(env, path, optional = false) {
  const response = await upstream(env, path);
  if (!response.ok) {
    if (optional && [403, 404].includes(response.status)) return null;
    throw new Error(`CoC API ${response.status} for ${path}`);
  }
  return response.json();
}
async function proxy(env, path) {
  if (!env.COC_API_TOKEN) return json({ error: 'COC_API_TOKEN is not configured' }, 503);
  try {
    const response = await upstream(env, path);
    return new Response(await response.text(), { status: response.status, headers: HEADERS });
  } catch (error) {
    return json({ error: 'Upstream request failed', reason: error.name === 'AbortError' ? 'timeout' : 'network' }, 502);
  }
}
async function schema(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS member_activity (tag TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_active TEXT, snapshot TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS activity_events (event_id TEXT PRIMARY KEY, tag TEXT NOT NULL, type TEXT NOT NULL, detected_at TEXT NOT NULL, details TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_activity_events_tag_time ON activity_events(tag, detected_at DESC)'),
    db.prepare('CREATE TABLE IF NOT EXISTS activity_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)'),
  ]);
}
async function state(db, key) {
  const row = await db.prepare('SELECT value FROM activity_state WHERE key = ?').bind(key).first();
  return row ? JSON.parse(row.value) : null;
}
async function saveState(db, key, value, time) {
  await db.prepare('INSERT INTO activity_state(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
    .bind(key, JSON.stringify(value), time).run();
}
async function event(db, id, playerTag, type, details, time) {
  if (!playerTag) return;
  const result = await db.prepare('INSERT OR IGNORE INTO activity_events(event_id, tag, type, detected_at, details) VALUES (?, ?, ?, ?, ?)')
    .bind(id, playerTag, type, time, JSON.stringify(details)).run();
  if (result.meta?.changes) {
    await db.prepare('UPDATE member_activity SET last_active = ? WHERE tag = ?').bind(time, playerTag).run();
  }
}
function stats(member) {
  return {
    donations: member.donations || 0,
    donationsReceived: member.donationsReceived || 0,
    trophies: member.trophies || 0,
    expLevel: member.expLevel || 0,
    townHallLevel: member.townHallLevel || 0,
    builderBaseTrophies: member.builderBaseTrophies || 0,
    role: member.role || 'member',
    leagueTier: member.leagueTier?.id || null,
  };
}
async function collectMembers(env, time) {
  const clan = await readUpstream(env, `/clans/${tag(env.CLAN_TAG)}`);
  const members = clan.memberList || [];
  const oldList = await env.DB.prepare('SELECT tag, snapshot FROM member_activity').all();
  const previous = new Map((oldList.results || []).map(m => [m.tag, m.snapshot]));
  const hadBaseline = await state(env.DB, 'members_initialized');
  const present = new Set();
  for (const member of members) {
    present.add(member.tag);
    const current = stats(member);
    const oldRaw = previous.get(member.tag);
    const old = oldRaw ? JSON.parse(oldRaw) : null;
    const snapshot = JSON.stringify(current);
    await env.DB.prepare(`INSERT INTO member_activity(tag, first_seen, last_active, snapshot) VALUES (?, ?, NULL, ?)
      ON CONFLICT(tag) DO UPDATE SET snapshot = excluded.snapshot`)
      .bind(member.tag, time, snapshot).run();
    if (!old && hadBaseline) {
      await event(env.DB, hashKey('join', member.tag, time), member.tag, 'join', { name: member.name }, time);
    } else if (old) {
      // Existing database snapshots may contain only four fields; absent fields are NOT counted as changes.
      for (const [field, value] of Object.entries(current)) {
        if (!Object.prototype.hasOwnProperty.call(old, field) || old[field] === value) continue;
        const id = hashKey('stat', member.tag, field, time);
        await event(env.DB, id, member.tag, field === 'role' ? 'role_change' : 'stat_change',
          { field, from: old[field], to: value, name: member.name }, time);
      }
    }
  }
  if (hadBaseline) {
    for (const oldTag of previous.keys()) {
      if (!present.has(oldTag)) {
        // Avoid repeated leave events: persist roster baseline separately.
        const oldRoster = await state(env.DB, 'roster');
        if (Array.isArray(oldRoster) && oldRoster.includes(oldTag)) {
          await event(env.DB, hashKey('leave', oldTag, time), oldTag, 'leave', {}, time);
        }
      }
    }
  }
  await saveState(env.DB, 'roster', [...present], time);
  await saveState(env.DB, 'members_initialized', true, time);
}
async function collectWarObject(env, war, type, time) {
  if (!war || !['inWar', 'warEnded', 'preparation'].includes(war.state)) return;
  const warId = hashKey(type, war.startTime || war.preparationStartTime || war.endTime || 'unknown', war.clan?.tag, war.opponent?.tag);
  const key = `war:${warId}`;
  const known = await state(env.DB, key);
  const attacks = [];
  for (const side of [war.clan, war.opponent]) {
    for (const member of side?.members || []) {
      for (const attack of member.attacks || []) {
        attacks.push({ tag: member.tag, order: attack.order, defenderTag: attack.defenderTag, stars: attack.stars, destructionPercentage: attack.destructionPercentage });
      }
    }
  }
  const previous = new Set(known?.attacks || []);
  const current = [];
  for (const attack of attacks) {
    const id = hashKey('attack', warId, attack.tag, attack.order ?? attack.defenderTag);
    current.push(id);
    // Only attribute activity to members of OUR clan.
    if (attack.tag && !previous.has(id) && known && attack.tag && (war.clan?.members || []).some(m => m.tag === attack.tag)) {
      await event(env.DB, id, attack.tag, type === 'cwl' ? 'cwl_attack' : 'war_attack',
        { warId, defenderTag: attack.defenderTag, stars: attack.stars, destructionPercentage: attack.destructionPercentage }, time);
    }
  }
  await saveState(env.DB, key, { attacks: current }, time);
}
async function collectWar(env, time) {
  const clanTag = tag(env.CLAN_TAG);
  const war = await readUpstream(env, `/clans/${clanTag}/currentwar`, true);
  if (war) await collectWarObject(env, war, 'war', time);
  const league = await readUpstream(env, `/clans/${clanTag}/currentwar/leaguegroup`, true);
  if (!league?.rounds) return;
  // API leaguegroup includes warTags; fetch active rounds individually.
  const warTags = [...new Set(league.rounds.flatMap(r => r.warTags || []))].filter(t => t && t !== '#0');
  for (const warTag of warTags) {
    const cwlWar = await readUpstream(env, `/clanwarleagues/wars/${tag(warTag)}`, true);
    if (cwlWar && [cwlWar.clan?.tag, cwlWar.opponent?.tag].includes(env.CLAN_TAG.startsWith('#') ? env.CLAN_TAG : `#${env.CLAN_TAG}`)) {
      // Normalize orientation so our clan is the 'clan' side.
      if (cwlWar.clan?.tag !== (env.CLAN_TAG.startsWith('#') ? env.CLAN_TAG : `#${env.CLAN_TAG}`)) {
        [cwlWar.clan, cwlWar.opponent] = [cwlWar.opponent, cwlWar.clan];
      }
      await collectWarObject(env, cwlWar, 'cwl', time);
    }
  }
}
async function collectRaid(env, time) {
  const data = await readUpstream(env, `/clans/${tag(env.CLAN_TAG)}/capitalraidseasons?limit=1`, true);
  const raid = data?.items?.[0];
  if (!raid?.startTime) return;
  const key = `raid:${raid.startTime}`;
  const previous = await state(env.DB, key);
  const previousMembers = previous?.members || {};
  const members = {};
  for (const member of raid.members || []) {
    const value = { attacks: member.attacks || 0, capitalResourcesLooted: member.capitalResourcesLooted || 0 };
    members[member.tag] = value;
    if (!previous || !previousMembers[member.tag]) continue;
    const old = previousMembers[member.tag];
    if (value.attacks > old.attacks || value.capitalResourcesLooted > old.capitalResourcesLooted) {
      await event(env.DB, hashKey('raid', raid.startTime, member.tag, value.attacks, value.capitalResourcesLooted),
        member.tag, 'raid_activity', { from: old, to: value, raidStart: raid.startTime }, time);
    }
  }
  await saveState(env.DB, key, { members }, time);
}
async function collect(env) {
  if (!env.DB || !env.CLAN_TAG || !env.COC_API_TOKEN) throw new Error('Missing DB, CLAN_TAG or COC_API_TOKEN');
  await schema(env.DB);
  const time = nowISO();
  // Each source is isolated: one API error should not block other tracking.
  const jobs = [collectMembers(env, time), collectWar(env, time)];
  if (Math.floor(Date.now() / 60000) % 15 < 5) jobs.push(collectRaid(env, time));
  const results = await Promise.allSettled(jobs);
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length) console.error('Tracker errors:', failures.map(f => String(f.reason)));
}
async function getActivity(env, url) {
  if (!env.DB) return json({ members: [], trackingSince: null, warning: 'D1 DB binding not configured' });
  try {
    await schema(env.DB);
    if (url.pathname === '/activity/events') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
      const playerTag = url.searchParams.get('tag');
      const rows = playerTag
        ? await env.DB.prepare('SELECT * FROM activity_events WHERE tag = ? ORDER BY detected_at DESC LIMIT ?').bind(playerTag, limit).all()
        : await env.DB.prepare('SELECT * FROM activity_events ORDER BY detected_at DESC LIMIT ?').bind(limit).all();
      return json({ events: (rows.results || []).map(r => ({ id: r.event_id, tag: r.tag, type: r.type, detectedAt: r.detected_at, details: JSON.parse(r.details) })) });
    }
    const result = await env.DB.prepare('SELECT tag, first_seen, last_active FROM member_activity ORDER BY tag').all();
    const members = (result.results || []).map(r => ({ tag: r.tag, firstSeen: r.first_seen, lastActive: r.last_active }));
    return json({ members, trackingSince: members.length ? members.reduce((min, m) => m.firstSeen < min ? m.firstSeen : min, members[0].firstSeen) : null });
  } catch (error) {
    console.error('Activity read error', error);
    return json({ error: 'Unable to read activity data' }, 500);
  }
}
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (!routes.has(pathname)) return json({ error: 'Not found' }, 404);
    if (pathname.startsWith('/activity')) return getActivity(env, new URL(pathname + url.search, url.origin));
    if (!env.CLAN_TAG) return json({ error: 'CLAN_TAG is not configured' }, 503);
    const clanTag = tag(env.CLAN_TAG);
    const paths = {
      '/clan': `/clans/${clanTag}`,
      '/currentwar': `/clans/${clanTag}/currentwar`,
      '/raid': `/clans/${clanTag}/capitalraidseasons?limit=1`,
      '/cwl': `/clans/${clanTag}/currentwar/leaguegroup`,
    };
    return proxy(env, paths[pathname]);
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(collect(env)); },
};
