const BASE = 'https://cocproxy.royaleapi.dev/v1';
const TAG = '#2RVRP900V';
const TRACKER = 'https://api-tracker.sambalclash.workers.dev';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
});
const message = e => String(e?.message || e);
const tagKey = t => String(t || '').replace(/^#/, '').toUpperCase();
const parseCoCTime = t => {
  if (!t) return NaN;
  const m = String(t).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/);
  return m ? Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]) : Date.parse(t);
};

async function init(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS latest (kind TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS history (kind TEXT NOT NULL, record_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(kind, record_id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS history_kind_updated ON history(kind, updated_at DESC)'),
    db.prepare('CREATE TABLE IF NOT EXISTS member_activity (tag TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_active TEXT)'),
  ]);
}
async function coc(env, path) {
  if (!env.COC_API_TOKEN) throw Error('COC_API_TOKEN missing');
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${env.COC_API_TOKEN}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw Error(`CoC ${r.status} ${path}: ${(await r.text()).slice(0, 150)}`);
  return r.json();
}
async function latest(db, kind, payload, now) {
  await db.prepare('INSERT INTO latest(kind,payload,updated_at) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at')
    .bind(kind, JSON.stringify(payload), now).run();
}
async function history(db, kind, id, payload, now) {
  await db.prepare('INSERT INTO history(kind,record_id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(kind,record_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at')
    .bind(kind, id, JSON.stringify(payload), now).run();
}
async function readLatest(db, kind) {
  const row = await db.prepare('SELECT payload FROM latest WHERE kind=?').bind(kind).first();
  return row ? JSON.parse(row.payload) : null;
}
async function readHistory(db, kind, limit) {
  const { results } = await db.prepare('SELECT record_id,payload,updated_at FROM history WHERE kind=? ORDER BY updated_at DESC LIMIT ?')
    .bind(kind, limit).all();
  return { items: results.map(r => ({ id: r.record_id, updatedAt: r.updated_at, data: JSON.parse(r.payload) })) };
}

// War log entries are summaries, not full attack records. Preserve the saved
// current-war payload and only add final score/status once the entry is matched.
function matchWarLog(war, log) {
  if (!war?.startTime || !war?.opponent?.tag) return null;
  const opponent = tagKey(war.opponent.tag);
  const own = tagKey(TAG);
  const targetEnd = parseCoCTime(war.endTime);
  for (const entry of log?.items || []) {
    const a = tagKey(entry.clan?.tag);
    const b = tagKey(entry.opponent?.tag);
    if (!((a === own && b === opponent) || (b === own && a === opponent))) continue;
    const logEnd = parseCoCTime(entry.endTime);
    // Opponent may recur; require matching end time within 10 minutes.
    if (!Number.isFinite(logEnd) || !Number.isFinite(targetEnd) || Math.abs(logEnd - targetEnd) > 600000) continue;
    const ours = a === own ? entry.clan : entry.opponent;
    const theirs = a === own ? entry.opponent : entry.clan;
    return { entry, ours, theirs };
  }
  return null;
}
async function finalizeWar(env, now) {
  // Only finalize previously captured full wars. Never fabricate attack details.
  const { results } = await env.DB.prepare(
    "SELECT record_id,payload FROM history WHERE kind='war' ORDER BY updated_at DESC LIMIT 30"
  ).all();
  const pending = results.map(r => ({ id: r.record_id, data: JSON.parse(r.payload) }))
    .filter(r => r.data?.state !== 'warEnded' && r.data?.startTime &&
      Number.isFinite(parseCoCTime(r.data.endTime)) && parseCoCTime(r.data.endTime) <= Date.now());
  if (!pending.length) return { kind: 'war_finalize', ok: true, pending: 0, finalized: 0 };
  let log;
  try {
    log = await coc(env, `/clans/${encodeURIComponent(TAG)}/warlog?limit=50`);
  } catch (e) {
    // Private war logs / API outages must not erase existing snapshots.
    return { kind: 'war_finalize', ok: false, pending: pending.length, error: message(e) };
  }
  let finalized = 0;
  for (const row of pending) {
    const matched = matchWarLog(row.data, log);
    if (!matched) continue;
    const data = {
      ...row.data,
      state: 'warEnded',
      clan: { ...row.data.clan, attacks: matched.ours.attacks ?? row.data.clan?.attacks,
        stars: matched.ours.stars ?? row.data.clan?.stars,
        destructionPercentage: matched.ours.destructionPercentage ?? row.data.clan?.destructionPercentage },
      opponent: { ...row.data.opponent, attacks: matched.theirs.attacks ?? row.data.opponent?.attacks,
        stars: matched.theirs.stars ?? row.data.opponent?.stars,
        destructionPercentage: matched.theirs.destructionPercentage ?? row.data.opponent?.destructionPercentage },
      finalResult: matched.entry.result || null,
      finalSource: 'warlog',
    };
    await history(env.DB, 'war', row.id, data, now);
    finalized++;
  }
  return { kind: 'war_finalize', ok: true, pending: pending.length, finalized };
}

async function refreshClanWarRaid(env, now) {
  const tag = encodeURIComponent(TAG);
  const paths = {
    clan: `/clans/${tag}`,
    currentwar: `/clans/${tag}/currentwar`,
    raid: `/clans/${tag}/capitalraidseasons?limit=5`
  };
  return Promise.all(Object.entries(paths).map(async ([kind, path]) => {
    try {
      const raw = await coc(env, path);
      const data = kind === 'raid' ? raw.items?.[0] ?? null : raw;
      await latest(env.DB, kind, data, now);
      if (kind === 'currentwar' && data?.startTime && data.state !== 'notInWar') {
        const id = `${TAG}:${data.startTime}`;
        const previous = await env.DB.prepare("SELECT payload FROM history WHERE kind='war' AND record_id=?").bind(id).first();
        const prev = previous ? JSON.parse(previous.payload) : null;
        // A stale inWar response must not overwrite a finalized snapshot.
        if (prev?.state !== 'warEnded' || data.state === 'warEnded') {
          await history(env.DB, 'war', id, data, now);
        }
      }
      if (kind === 'raid') {
        for (const item of raw.items || []) {
          if (item.startTime) await history(env.DB, 'raid', item.startTime, item, now);
        }
      }
      return { kind, ok: true };
    } catch (e) { return { kind, ok: false, error: message(e) }; }
  }));
}
async function refreshActivity(env, now) {
  const r = await fetch(`${TRACKER}/activity`, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw Error(`Tracker HTTP ${r.status}`);
  const raw = await r.json();
  if (!Array.isArray(raw.members)) throw Error('Tracker response missing members[]');
  for (const m of raw.members) {
    if (!m.tag) continue;
    await env.DB.prepare(`INSERT INTO member_activity(tag,first_seen,last_active) VALUES(?,?,?)
      ON CONFLICT(tag) DO UPDATE SET
      first_seen=CASE WHEN excluded.first_seen < member_activity.first_seen THEN excluded.first_seen ELSE member_activity.first_seen END,
      last_active=CASE WHEN excluded.last_active IS NULL THEN member_activity.last_active
        WHEN member_activity.last_active IS NULL OR excluded.last_active > member_activity.last_active THEN excluded.last_active
        ELSE member_activity.last_active END`)
      .bind(m.tag, m.firstSeen || now, m.lastActive || null).run();
  }
  return { kind: 'activity', ok: true, count: raw.members.length };
}
async function activityResponse(db) {
  const { results } = await db.prepare('SELECT tag,first_seen,last_active FROM member_activity ORDER BY tag').all();
  return { members: results.map(r => ({ tag: r.tag, firstSeen: r.first_seen, lastActive: r.last_active })) };
}
async function refreshCwl(env, now) {
  const group = await coc(env, `/clans/${encodeURIComponent(TAG)}/currentwar/leaguegroup`);
  if (!group || !Array.isArray(group.rounds)) throw Error('No active CWL group (or unavailable API)');
  await latest(env.DB, 'cwl_group', group, now);
  const season = group.season || 'unknown';
  await history(env.DB, 'cwl_group', season, group, now);
  const rounds = [];
  let saved = 0;
  for (let i = 0; i < group.rounds.length; i++) {
    const tags = group.rounds[i]?.warTags || [];
    let ownWar = null;
    for (const warTag of tags) {
      if (!warTag || warTag === '#0') continue;
      try {
        const war = await coc(env, `/clanwarleagues/wars/${encodeURIComponent(warTag)}`);
        if (war.clan?.tag !== TAG && war.opponent?.tag !== TAG) continue;
        ownWar = war;
        await history(env.DB, 'cwl', `${season}:round_${i + 1}`, war, now);
        saved++;
        break;
      } catch (e) { console.warn('CWL war unavailable', warTag, message(e)); }
    }
    rounds.push({ round: i + 1, war: ownWar });
  }
  const data = { season, state: group.state, group, rounds };
  await latest(env.DB, 'cwl', data, now);
  return { kind: 'cwl', ok: true, savedRounds: saved };
}
async function refreshAll(env) {
  await init(env.DB);
  const now = new Date().toISOString();
  const base = await refreshClanWarRaid(env, now);
  const extras = await Promise.all([
    finalizeWar(env, now).catch(e => ({ kind: 'war_finalize', ok: false, error: message(e) })),
    refreshActivity(env, now).catch(e => ({ kind: 'activity', ok: false, error: message(e) })),
    refreshCwl(env, now).catch(e => ({ kind: 'cwl', ok: false, error: message(e) }))
  ]);
  const results = [...base, ...extras];
  return { updatedAt: now, ok: results.every(x => x.ok), results };
}
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    try {
      if (!env.DB) return json({ error: 'D1 binding missing' }, 500);
      const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
      if (path === '/') return json({ name: 'Balado API', endpoints: ['/health','/clan','/currentwar','/raid','/activity','/cwl','/cwl/groups','/api/war/history','/war/history','/api/raid/history','/api/cwl/history'] });
      await init(env.DB);
      if (path === '/health') return json({ status: 'ok', d1: true, apiTokenConfigured: !!env.COC_API_TOKEN });
      if (path === '/activity') return json(await activityResponse(env.DB));
      const route = { '/clan': 'clan', '/currentwar': 'currentwar', '/raid': 'raid', '/cwl': 'cwl', '/cwl/groups': 'cwl_group', '/api/clan': 'clan', '/api/currentwar': 'currentwar', '/api/raid': 'raid', '/api/cwl': 'cwl' }[path];
      if (route) {
        const data = await readLatest(env.DB, route);
        return data === null ? json({ error: 'No saved data yet' }, 404) : json(data);
      }
      const kind = { '/api/war/history': 'war', '/war/history': 'war', '/api/raid/history': 'raid', '/api/cwl/history': 'cwl' }[path];
      if (kind) {
        const limit = Math.min(100, Math.max(1, Number.parseInt(new URL(request.url).searchParams.get('limit') || '20', 10) || 20));
        return json(await readHistory(env.DB, kind, limit));
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) { console.error('Request error', e); return json({ error: 'Request failed', detail: message(e) }, 500); }
  },
  async scheduled(controller, env) {
    try {
      const result = await refreshAll(env);
      console.log('Balado scheduled refresh', JSON.stringify(result));
      if (result.results.some(x => !x.ok && !['cwl', 'activity', 'war_finalize'].includes(x.kind))) {
        throw Error('Core refresh failed: ' + JSON.stringify(result.results.filter(x => !x.ok)));
      }
    } catch (e) { console.error('Cron failed', e?.stack || message(e)); throw e; }
  }
};
