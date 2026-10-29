const BASE = 'https://cocproxy.royaleapi.dev/v1';
const TAG = '#2RVRP900V';

const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
async function initialize(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS latest (
        kind TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS history (
        kind TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(kind, record_id)
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS history_kind_updated
      ON history(kind, updated_at DESC)
    `)
  ]);
}

async function apiFetch(env, path) {
  if (!env.COC_API_TOKEN) {
    throw new Error('COC_API_TOKEN is missing');
  }

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${env.COC_API_TOKEN}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    throw new Error(`CoC API returned ${res.status}`);
  }

  return res.json();
}

async function saveLatest(db, kind, data, now) {
  await db.prepare(`
    INSERT INTO latest(kind, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(kind) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).bind(kind, JSON.stringify(data), now).run();
}

async function saveHistory(db, kind, id, data, now) {
  await db.prepare(`
    INSERT INTO history(kind, record_id, payload, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(kind, record_id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).bind(kind, id, JSON.stringify(data), now).run();
}

async function refresh(env) {
  await initialize(env.DB);

  const tag = encodeURIComponent(TAG);
  const now = new Date().toISOString();

  const endpoints = {
    clan: `/clans/${tag}`,
    currentwar: `/clans/${tag}/currentwar`,
    raid: `/clans/${tag}/capitalraidseasons?limit=5`
  };

  const results = await Promise.allSettled(
    Object.entries(endpoints).map(async ([kind, path]) => {
      const raw = await apiFetch(env, path);
      const data = kind === 'raid'
        ? raw.items?.[0] ?? null
        : raw;

      await saveLatest(env.DB, kind, data, now);

      if (kind === 'currentwar') {
        if (data.state !== 'notInWar' && data.startTime) {
          const id = `${data.clan?.tag || TAG}:${data.startTime}`;

          await saveHistory(
            env.DB, 'war', id, data, now
          );
        }
      }

      if (kind === 'raid') {
        for (const item of raw.items || []) {
          if (item.startTime) {
            await saveHistory(
              env.DB,
              'raid',
              item.startTime,
              item,
              now
            );
          }
        }
      }

      return { kind, ok: true };
    })
  );

  const kinds = Object.keys(endpoints);

  const summary = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    return {
      kind: kinds[index],
      ok: false,
      error: String(result.reason?.message || result.reason)
    };
  });

  return {
    updatedAt: now,
    ok: summary.every(item => item.ok),
    results: summary
  };
}

async function getLatest(db, kind) {
  const row = await db.prepare(`
    SELECT payload, updated_at
    FROM latest
    WHERE kind = ?
  `).bind(kind).first();

  if (!row) return null;

  return {
    data: JSON.parse(row.payload),
    updatedAt: row.updated_at
  };
}

async function getHistory(db, kind, limit) {
  const rows = await db.prepare(`
    SELECT record_id, payload, updated_at
    FROM history
    WHERE kind = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).bind(kind, limit).all();

  return rows.results.map(row => ({
    id: row.record_id,
    updatedAt: row.updated_at,
    data: JSON.parse(row.payload)
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    try {
      if (!env.DB) {
        return respond({ error: 'D1 binding missing' }, 500);
      }

      if (path === '/') {
        return respond({
          name: 'Balado CoC API',
          clanTag: TAG,
          endpoints: [
            '/health',
            '/clan',
            '/currentwar',
            '/raid',
            '/api/clan',
            '/api/currentwar',
            '/api/raid',
            '/api/war/history',
            '/api/raid/history'
          ]
        });
      }

      if (path === '/api/refresh') {
        if (request.method !== 'POST') {
          return respond({ error: 'POST required' }, 405);
        }

        if (!env.REFRESH_TOKEN) {
          return respond({ error: 'Refresh token missing' }, 503);
        }

        const authorization = request.headers.get('Authorization');

        if (authorization !== `Bearer ${env.REFRESH_TOKEN}`) {
          return respond({ error: 'Unauthorized' }, 401);
        }

        const result = await refresh(env);
        return respond(result, result.ok ? 200 : 207);
      }

      if (request.method !== 'GET') {
        return respond({ error: 'Method not allowed' }, 405);
      }

      await initialize(env.DB);

      if (path === '/health') {
        const check = await env.DB.prepare(
          'SELECT 1 AS ok'
        ).first();

        return respond({
          status: 'ok',
          d1: check?.ok === 1,
          apiTokenConfigured: !!env.COC_API_TOKEN
        });
      }

      const latestRoutes = {
        '/clan': 'clan',
        '/currentwar': 'currentwar',
        '/raid': 'raid',
        '/api/clan': 'clan',
        '/api/currentwar': 'currentwar',
        '/api/raid': 'raid'
      };

      const kind = latestRoutes[path];

      if (kind) {
        const result = await getLatest(env.DB, kind);

        if (!result) {
          return respond({
            error: 'No saved data yet'
          }, 404);
        }

        return respond(
          path.startsWith('/api/')
            ? result
            : result.data
        );
      }

      const historyRoutes = {
        '/api/war/history': 'war',
        '/api/raid/history': 'raid'
      };

      const historyKind = historyRoutes[path];

      if (historyKind) {
        const limit = Math.min(
          100,
          Math.max(
            1,
            parseInt(url.searchParams.get('limit') || '20') || 20
          )
        );

        return respond({
          items: await getHistory(
            env.DB, historyKind, limit
          )
        });
      }

      return respond({ error: 'Not found' }, 404);

    } catch (error) {
      console.error(error);

      return respond({
        error: 'Request failed',
        detail: String(error.message || error)
      }, 500);
    }
  },

  async scheduled(controller, env) {
    const result = await refresh(env);

    console.log(
      'Balado refresh:',
      JSON.stringify(result)
    );

    if (!result.ok) {
      throw new Error('Refresh failed');
    }
  }
};