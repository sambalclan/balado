// Cloudflare Worker: proxy aman ke Clash of Clans API untuk dashboard Balado.
//
// Token (COC_API_TOKEN) hanya hidup di Worker sebagai secret, tidak pernah dikirim ke browser.
// Worker tetap memanggil proxy RoyaleAPI (sama seperti scraper), jadi IP token tidak bermasalah.
//
// Endpoint (semua GET, respons JSON):
//   /clan        -> info clan + daftar member
//   /currentwar  -> war yang sedang berjalan / baru selesai (state "notInWar" jika tidak ada)
//   /raid        -> raid weekend terbaru
//   /cwl         -> CWL musim ini dalam bentuk yang dipakai frontend (404 jika tidak ikut CWL)
//   /health      -> cek Worker hidup

const DEFAULT_BASE_URL = "https://cocproxy.royaleapi.dev/v1";

// Cache dalam memori isolate (cadangan, karena Cache API tidak aktif di *.workers.dev)
const memCache = new Map();

const TTL = {
  clan: 120,
  war: 30,
  raid: 60,
  cwlGroup: 300,
  cwlWarLive: 60,
  cwlWarEnded: 3600,
};

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, cors);

    if (!env.COC_API_TOKEN || !env.CLAN_TAG) {
      return json({ error: "Worker belum dikonfigurasi (COC_API_TOKEN / CLAN_TAG)." }, 500, cors);
    }

    const api = new CocApi(env, ctx);
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

    try {
      switch (path) {
        case "/health":
          return json({ ok: true }, 200, cors, 0);
        case "/clan":
          return upstream(await api.get(`/clans/${api.clanTag}`, TTL.clan), cors, TTL.clan);
        case "/currentwar":
          return upstream(await api.get(`/clans/${api.clanTag}/currentwar`, TTL.war), cors, TTL.war);
        case "/raid": {
          const r = await api.get(`/clans/${api.clanTag}/capitalraidseasons?limit=1`, TTL.raid);
          if (r.status !== 200) return upstream(r, cors, TTL.raid);
          const raid = (r.data.items || [])[0];
          return raid ? json(raid, 200, cors, TTL.raid) : json({ error: "Belum ada data raid." }, 404, cors, 30);
        }
        case "/cwl":
          return await cwl(api, cors);
        default:
          return json({ error: "Not found" }, 404, cors, 0);
      }
    } catch (e) {
      return json({ error: "Gagal menghubungi API Clash of Clans." }, 502, cors, 0);
    }
  },
};

// ─── CWL ────────────────────────────────────────────────────────────────
// Menghasilkan bentuk yang dibaca js/war.js dan js/members.js:
// { season, state, clan: { members: [{tag,name,townHallLevel}] },
//   rounds: [{ attacks: [{attackerTag, stars}] }], members: [{tag, stars}] }
async function cwl(api, cors) {
  const g = await api.get(`/clans/${api.clanTag}/currentwar/leaguegroup`, TTL.cwlGroup);
  if (g.status === 404 || (g.status === 200 && g.data?.state === "notInWar")) {
    return json({ error: "Clan tidak sedang mengikuti CWL." }, 404, cors, 60);
  }
  if (g.status !== 200) return upstream(g, cors, TTL.cwlGroup);

  const group = g.data;
  const myTag = api.rawTag;
  const myClan = (group.clans || []).find((c) => c.tag === myTag);

  const rounds = [];
  const stars = new Map();

  for (const round of group.rounds || []) {
    const tags = (round.warTags || []).filter((t) => t && t !== "#0");
    if (tags.length === 0) continue;

    // Satu war per ronde yang melibatkan clan kita
    const wars = await Promise.all(tags.map((t) => api.getWar(t)));
    const war = wars.find((w) => w && (w.clan?.tag === myTag || w.opponent?.tag === myTag));
    if (!war) continue;

    const mySide = war.clan?.tag === myTag ? war.clan : war.opponent;
    const attacks = [];
    for (const m of mySide.members || []) {
      for (const a of m.attacks || []) {
        attacks.push({ attackerTag: m.tag, stars: a.stars || 0 });
        stars.set(m.tag, (stars.get(m.tag) || 0) + (a.stars || 0));
      }
    }
    rounds.push({ attacks });
  }

  const members = (myClan?.members || []).map((m) => ({
    tag: m.tag,
    name: m.name,
    townHallLevel: m.townHallLevel,
  }));

  return json(
    {
      season: group.season,
      state: group.state,
      clan: { members },
      rounds,
      members: members.map((m) => ({ tag: m.tag, stars: stars.get(m.tag) || 0 })),
    },
    200,
    cors,
    TTL.cwlWarLive
  );
}

// ─── Klien API CoC (dengan cache) ───────────────────────────────────────
class CocApi {
  constructor(env, ctx) {
    this.env = env;
    this.ctx = ctx;
    this.base = (env.COC_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.rawTag = env.CLAN_TAG.startsWith("#") ? env.CLAN_TAG : `#${env.CLAN_TAG}`;
    this.clanTag = encodeURIComponent(this.rawTag);
  }

  async get(path, ttl) {
    const url = `${this.base}${path}`;
    const now = Date.now();

    const hit = memCache.get(url);
    if (hit && hit.expires > now) return hit.value;

    // Cache API (aktif di custom domain, no-op di workers.dev)
    const cacheKey = new Request(url);
    let cached;
    try { cached = await caches.default.match(cacheKey); } catch { /* abaikan */ }
    if (cached) {
      const value = { status: cached.status, data: await cached.json() };
      memCache.set(url, { value, expires: now + ttl * 1000 });
      return value;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.env.COC_API_TOKEN}`, Accept: "application/json" },
    });

    let data = null;
    try { data = await res.json(); } catch { /* bukan JSON */ }
    const value = { status: res.status, data };

    // Hanya simpan respons sukses supaya error sesaat tidak "menempel"
    if (res.status === 200 && data) {
      memCache.set(url, { value, expires: now + ttl * 1000 });
      if (memCache.size > 200) memCache.delete(memCache.keys().next().value);
      try {
        const stored = new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
        });
        this.ctx.waitUntil(caches.default.put(cacheKey, stored));
      } catch { /* abaikan */ }
    }
    return value;
  }

  // War CWL: yang sudah selesai di-cache lama, yang masih jalan di-cache singkat
  async getWar(tag) {
    const path = `/clanwarleagues/wars/${encodeURIComponent(tag)}`;
    const url = `${this.base}${path}`;
    const hit = memCache.get(url);
    const ttl = hit?.value?.data?.state === "warEnded" ? TTL.cwlWarEnded : TTL.cwlWarLive;
    const r = await this.get(path, ttl);
    if (r.status === 200 && r.data?.state === "warEnded") {
      memCache.set(url, { value: r, expires: Date.now() + TTL.cwlWarEnded * 1000 });
    }
    return r.status === 200 ? r.data : null;
  }
}

// ─── Helper respons ─────────────────────────────────────────────────────
function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  const allow = allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body, status, cors, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": maxAge > 0 ? `public, max-age=${maxAge}` : "no-store",
      ...cors,
    },
  });
}

// Teruskan hasil upstream; pesan error API tidak dibocorkan mentah
function upstream(r, cors, ttl) {
  if (r.status === 200) return json(r.data, 200, cors, ttl);
  const status = [403, 404, 429, 503].includes(r.status) ? r.status : 502;
  return json({ error: `API Clash of Clans mengembalikan status ${r.status}.` }, status, cors, 0);
}
