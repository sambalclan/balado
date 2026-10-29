// Sambal Balado — live CoC API + D1 archives. Entry point: balado/worker.js
// Bindings: DB (D1), CLAN_TAG, COC_API_TOKEN (secret), COC_API_BASE (optional).
// Cron: */15 * * * * . No member online/activity tracking.
// Single Worker: static website + /api/* + D1 archives + scheduled snapshots.
const DEFAULT_BASE = 'https://cocproxy.royaleapi.dev/v1';
const TTL = { clan: 120, war: 30, raid: 60, group: 300, cwlLive: 60, cwlEnded: 3600 };
const memCache = new Map();
const safeTag = t => encodeURIComponent(String(t || '').startsWith('#') ? t : `#${t}`);
const iso = () => new Date().toISOString();
const json = (data, status = 200, cors = {}, age = 0) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': age ? `public, max-age=${age}` : 'no-store', ...cors },
});
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': !allowed.length ? '*' : allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin',
  };
}
class CocApi {
  constructor(env, ctx) {
    this.env = env; this.ctx = ctx;
    this.base = String(env.COC_API_BASE || env.COC_API_BASE_URL || env.COC_PROXY_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
    this.rawTag = String(env.CLAN_TAG || '').startsWith('#') ? String(env.CLAN_TAG) : `#${env.CLAN_TAG || ''}`;
    this.clanTag = encodeURIComponent(this.rawTag);
  }
  async get(path, ttl = 0, fresh = false) {
    const url = `${this.base}${path}`;
    const hit = memCache.get(url);
    if (!fresh && ttl && hit && hit.expires > Date.now()) return hit.value;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${this.env.COC_API_TOKEN}`, Accept: 'application/json' }, signal: controller.signal });
      let data = null;
      try { data = await res.json(); } catch { /* API may return non-JSON */ }
      const value = { status: res.status, data };
      if (res.ok && data !== null && ttl) {
        memCache.set(url, { value, expires: Date.now() + ttl * 1000 });
        if (memCache.size > 200) memCache.delete(memCache.keys().next().value);
      }
      return value;
    } finally { clearTimeout(timer); }
  }
  async getWar(warTag, fresh = false) {
    const r = await this.get(`/clanwarleagues/wars/${safeTag(warTag)}`, TTL.cwlLive, fresh);
    if (r.status === 200 && r.data?.state === 'warEnded') {
      const url = `${this.base}/clanwarleagues/wars/${safeTag(warTag)}`;
      memCache.set(url, { value: r, expires: Date.now() + TTL.cwlEnded * 1000 });
    }
    return r.status === 200 ? r.data : null;
  }
}
const upstream = (r, cors, ttl = 0) => r.status === 200
  ? json(r.data, 200, cors, ttl)
  : json({ error: `API Clash of Clans mengembalikan status ${r.status}.` }, [403, 404, 429, 503].includes(r.status) ? r.status : 502, cors);

// Same CWL shape used by existing Balado frontend.
async function buildCwl(api, fresh = false) {
  const g = await api.get(`/clans/${api.clanTag}/currentwar/leaguegroup`, TTL.group, fresh);
  if (g.status !== 200 || g.data?.state === 'notInWar') return { status: g.status === 200 ? 404 : g.status, data: null, group: null, wars: [] };
  const group = g.data;
  const myTag = api.rawTag;
  const myClan = (group.clans || []).find(c => c.tag === myTag);
  const rounds = [], stars = new Map(), warsFound = [];
  for (const round of group.rounds || []) {
    const tags = (round.warTags || []).filter(t => t && t !== '#0');
    if (!tags.length) continue;
    // Query round tags in parallel but don't let a failed war erase the entire CWL.
    const wars = await Promise.allSettled(tags.map(t => api.getWar(t, fresh)));
    const war = wars.map(x => x.status === 'fulfilled' ? x.value : null)
      .find(w => w && (w.clan?.tag === myTag || w.opponent?.tag === myTag));
    if (!war) continue;
    warsFound.push(war);
    const side = war.clan?.tag === myTag ? war.clan : war.opponent;
    const attacks = [];
    for (const member of side?.members || []) for (const a of member.attacks || []) {
      attacks.push({ attackerTag: member.tag, stars: a.stars || 0 });
      stars.set(member.tag, (stars.get(member.tag) || 0) + (a.stars || 0));
    }
    rounds.push({ attacks });
  }
  const members = (myClan?.members || []).map(m => ({ tag: m.tag, name: m.name, townHallLevel: m.townHallLevel }));
  return { status: 200, group, wars: warsFound, data: {
    season: group.season, state: group.state, clan: { members }, rounds,
    members: members.map(m => ({ tag: m.tag, stars: stars.get(m.tag) || 0 })),
  } };
}

// New, isolated tables. Existing D1 tables are never dropped or modified.
async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS balado_members (day TEXT PRIMARY KEY, collected_at TEXT NOT NULL, payload TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS balado_wars (id TEXT PRIMARY KEY, state TEXT, start_time TEXT, updated_at TEXT NOT NULL, payload TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS balado_cwl (season TEXT PRIMARY KEY, updated_at TEXT NOT NULL, payload TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS balado_cwl_wars (id TEXT PRIMARY KEY, season TEXT, state TEXT, updated_at TEXT NOT NULL, payload TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS balado_raids (id TEXT PRIMARY KEY, state TEXT, updated_at TEXT NOT NULL, payload TEXT NOT NULL)`),
  ]);
}
const dayUTC = () => iso().slice(0, 10);
const warId = w => `${w.clan?.tag || ''}:${w.opponent?.tag || ''}:${w.startTime || w.preparationStartTime || w.endTime || ''}`;
async function saveMembers(db, clan, at) {
  const day = at.slice(0, 10);
  await db.prepare(`INSERT INTO balado_members(day,collected_at,payload) VALUES(?,?,?)
    ON CONFLICT(day) DO UPDATE SET collected_at=excluded.collected_at,payload=excluded.payload`)
    .bind(day, at, JSON.stringify(clan)).run();
}
async function saveWar(db, war, at) {
  if (!war || !['preparation', 'inWar', 'warEnded'].includes(war.state) || !war.startTime) return;
  await db.prepare(`INSERT INTO balado_wars(id,state,start_time,updated_at,payload) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at,payload=excluded.payload`)
    .bind(warId(war), war.state, war.startTime, at, JSON.stringify(war)).run();
}
async function saveCwl(db, cwl, at) {
  if (!cwl?.season) return;
  await db.prepare(`INSERT INTO balado_cwl(season,updated_at,payload) VALUES(?,?,?)
    ON CONFLICT(season) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload`)
    .bind(cwl.season, at, JSON.stringify(cwl)).run();
}
async function saveCwlWar(db, war, season, at) {
  if (!war?.startTime) return;
  await db.prepare(`INSERT INTO balado_cwl_wars(id,season,state,updated_at,payload) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET season=excluded.season,state=excluded.state,updated_at=excluded.updated_at,payload=excluded.payload`)
    .bind(warId(war), season || null, war.state || null, at, JSON.stringify(war)).run();
}
async function saveRaid(db, raid, at) {
  if (!raid?.startTime) return;
  await db.prepare(`INSERT INTO balado_raids(id,state,updated_at,payload) VALUES(?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at,payload=excluded.payload`)
    .bind(raid.startTime, raid.state || null, at, JSON.stringify(raid)).run();
}
async function collect(env, ctx) {
  if (!env.DB || !env.CLAN_TAG || !env.COC_API_TOKEN) throw new Error('Missing DB, CLAN_TAG or COC_API_TOKEN');
  await ensureSchema(env.DB);
  const api = new CocApi(env, ctx), at = iso(), results = {};
  // Separate each job: one unavailable upstream resource must not block the others.
  const tasks = [
    ['members', async () => { const r = await api.get(`/clans/${api.clanTag}`, 0, true); if (r.status !== 200) throw Error(`clan ${r.status}`); await saveMembers(env.DB, r.data, at); }],
    ['war', async () => { const r = await api.get(`/clans/${api.clanTag}/currentwar`, 0, true); if (r.status !== 200) throw Error(`war ${r.status}`); await saveWar(env.DB, r.data, at); }],
    ['raid', async () => { const r = await api.get(`/clans/${api.clanTag}/capitalraidseasons?limit=1`, 0, true); if (r.status !== 200) throw Error(`raid ${r.status}`); const raid = r.data?.items?.[0]; if (raid) await saveRaid(env.DB, raid, at); }],
    ['cwl', async () => { const c = await buildCwl(api, true); if (c.status === 404) return; if (c.status !== 200) throw Error(`cwl ${c.status}`); await saveCwl(env.DB, c.data, at); for (const war of c.wars) await saveCwlWar(env.DB, war, c.data.season, at); }],
  ];
  const settled = await Promise.allSettled(tasks.map(async ([name, run]) => { await run(); return name; }));
  settled.forEach((r, i) => { results[tasks[i][0]] = r.status === 'fulfilled' ? 'ok' : String(r.reason); });
  console.log('Balado archive', JSON.stringify(results));
  return results;
}
const archives = {
  '/members/history': { table: 'balado_members', order: 'day' },
  '/war/history': { table: 'balado_wars', order: 'start_time' },
  '/cwl/history': { table: 'balado_cwl', order: 'season' },
  '/cwl/groups': { table: 'balado_cwl', order: 'season' },
  '/cwl/wars': { table: 'balado_cwl_wars', order: 'updated_at' },
  '/raid/history': { table: 'balado_raids', order: 'id' },
};
async function history(db, path, url, cors) {
  if (!db) return json({ error: 'D1 DB binding belum terpasang.' }, 503, cors);
  await ensureSchema(db);
  const { table, order } = archives[path]; // Fixed whitelist: no SQL identifiers from user input.
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 30));
  const full = url.searchParams.get('full') === '1';
  const r = await db.prepare(`SELECT * FROM ${table} ORDER BY ${order} DESC LIMIT ?`).bind(limit).all();
  const items = (r.results || []).map(row => {
    if (full) return { ...row, payload: JSON.parse(row.payload) };
    const { payload, ...metadata } = row;
    return metadata;
  });
  return json({ items, count: items.length }, 200, cors);
}
export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);
    const url = new URL(request.url);
    const rawPath = url.pathname.replace(/\/+$/, '') || '/';
    const path = rawPath.startsWith('/api/') ? rawPath.slice(4) : rawPath;
    // Website and static files are served by the ASSETS binding.
    if (rawPath === '/' || (!rawPath.startsWith('/api/') && !(['/health', '/clan', '/currentwar', '/raid', '/cwl', ...Object.keys(archives)].includes(rawPath)))) {
      return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: 'ASSETS binding belum dikonfigurasi.' }, 503, cors);
    }
    if (path === '/health') return json({ ok: true, d1Configured: !!env.DB, archiveCron: '*/15 * * * *' }, 200, cors);
    try {
      if (archives[path]) return await history(env.DB, path, url, cors);
      if (!env.COC_API_TOKEN || !env.CLAN_TAG) return json({ error: 'COC_API_TOKEN / CLAN_TAG belum dikonfigurasi.' }, 503, cors);
      const api = new CocApi(env, ctx);
      switch (path) {
        case '/clan': return upstream(await api.get(`/clans/${api.clanTag}`, TTL.clan), cors, TTL.clan);
        case '/currentwar': return upstream(await api.get(`/clans/${api.clanTag}/currentwar`, TTL.war), cors, TTL.war);
        case '/raid': {
          const r = await api.get(`/clans/${api.clanTag}/capitalraidseasons?limit=1`, TTL.raid);
          if (r.status !== 200) return upstream(r, cors, TTL.raid);
          const raid = r.data?.items?.[0];
          return raid ? json(raid, 200, cors, TTL.raid) : json({ error: 'Belum ada data raid.' }, 404, cors);
        }
        case '/cwl': {
          const c = await buildCwl(api);
          return c.status === 200 ? json(c.data, 200, cors, TTL.cwlLive)
            : json({ error: c.status === 404 ? 'Not Following' : `CWL API ${c.status}` }, c.status === 404 ? 404 : 502, cors);
        }
        default: return json({ error: 'Not found' }, 404, cors);
      }
    } catch (e) {
      console.error('Balado request error', e);
      return json({ error: 'Worker gagal memproses permintaan.' }, 502, cors);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(collect(env, ctx));
  },
};
