
const BASE = 'https://cocproxy.royaleapi.dev/v1';
const TAG = '#2RVRP900V';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

const json = (value, status = 200) => new Response(
  JSON.stringify(value),
  {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8'
    }
  }
);

const message = e => String(e?.message || e);

const tagKey = tag =>
  String(tag || '').replace(/^#/, '').toUpperCase();

// =====================================================
// TIME
// =====================================================

function parseCoCTime(value) {
  if (!value) return NaN;

  const match = String(value).match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/
  );

  if (!match) return Date.parse(value);

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6])
  );
}

// =====================================================
// DATABASE - WAR REGULAR ONLY
// =====================================================

async function init(db) {
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
        PRIMARY KEY (kind, record_id)
      )
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS history_kind_updated
      ON history(kind, updated_at DESC)
    `)
  ]);
}

// =====================================================
// CLASH OF CLANS API
// =====================================================

async function coc(env, path) {
  if (!env.COC_API_TOKEN) {
    throw new Error('COC_API_TOKEN missing');
  }

  const response = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${env.COC_API_TOKEN}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const body = await response.text();

    const error = new Error(
      `CoC ${response.status} ${path}: ${body.slice(0, 150)}`
    );

    error.status = response.status;
    throw error;
  }

  return response.json();
}

// =====================================================
// DATABASE WRITE
// =====================================================

async function latest(db, kind, payload, now) {
  await db.prepare(`
    INSERT INTO latest (kind, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(kind)
    DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `)
    .bind(kind, JSON.stringify(payload), now)
    .run();
}

async function history(db, kind, id, payload, now) {
  await db.prepare(`
    INSERT INTO history (
      kind,
      record_id,
      payload,
      updated_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(kind, record_id)
    DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `)
    .bind(kind, id, JSON.stringify(payload), now)
    .run();
}

// =====================================================
// DATABASE READ
// =====================================================

async function readLatest(db, kind) {
  const row = await db.prepare(`
    SELECT payload
    FROM latest
    WHERE kind = ?
  `)
    .bind(kind)
    .first();

  return row ? JSON.parse(row.payload) : null;
}

async function readHistory(db, kind, limit = 20) {
  const { results } = await db.prepare(`
    SELECT
      record_id,
      payload,
      updated_at
    FROM history
    WHERE kind = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `)
    .bind(kind, limit)
    .all();

  return {
    items: results.map(row => ({
      id: row.record_id,
      updatedAt: row.updated_at,
      data: JSON.parse(row.payload)
    }))
  };
}

// =====================================================
// WAR LOG MATCHING
// =====================================================

function matchWarLog(war, log) {
  if (!war?.startTime || !war?.opponent?.tag) {
    return null;
  }

  const ownTag = tagKey(TAG);
  const opponentTag = tagKey(war.opponent.tag);

  const targetEnd = parseCoCTime(war.endTime);

  if (!Number.isFinite(targetEnd)) return null;

  for (const entry of log?.items || []) {
    const clanTag = tagKey(entry.clan?.tag);
    const enemyTag = tagKey(entry.opponent?.tag);

    const sameTeams =
      (
        clanTag === ownTag &&
        enemyTag === opponentTag
      ) ||
      (
        enemyTag === ownTag &&
        clanTag === opponentTag
      );

    if (!sameTeams) continue;

    const logEnd = parseCoCTime(entry.endTime);

    if (!Number.isFinite(logEnd)) continue;

    if (Math.abs(logEnd - targetEnd) > 600000) {
      continue;
    }

    const ours =
      clanTag === ownTag
        ? entry.clan
        : entry.opponent;

    const theirs =
      clanTag === ownTag
        ? entry.opponent
        : entry.clan;

    return {
      entry,
      ours,
      theirs
    };
  }

  return null;
}

// =====================================================
// FINAL WAR RESULT
// =====================================================

function calculateWarResult(clan, opponent) {
  const clanStars = Number(clan?.stars ?? 0);
  const enemyStars = Number(opponent?.stars ?? 0);

  if (clanStars > enemyStars) return 'win';
  if (clanStars < enemyStars) return 'lose';

  const clanDestruction = Number(
    clan?.destructionPercentage ?? 0
  );

  const enemyDestruction = Number(
    opponent?.destructionPercentage ?? 0
  );

  if (clanDestruction > enemyDestruction) return 'win';
  if (clanDestruction < enemyDestruction) return 'lose';

  return 'tie';
}

// =====================================================
// AUTOMATIC WAR FINALIZATION
// =====================================================

async function finalizeWar(env, now) {
  const { results } = await env.DB.prepare(`
    SELECT record_id, payload
    FROM history
    WHERE kind = 'war'
    ORDER BY updated_at DESC
    LIMIT 100
  `).all();

  const pending = results
    .map(row => ({
      id: row.record_id,
      data: JSON.parse(row.payload)
    }))
    .filter(row => {
      const war = row.data;

      if (!war?.startTime) return false;
      if (war.state === 'warEnded') return false;

      const endTime = parseCoCTime(war.endTime);

      return (
        Number.isFinite(endTime) &&
        endTime <= Date.now()
      );
    });

  if (pending.length === 0) {
    return {
      kind: 'war_finalize',
      ok: true,
      pending: 0,
      finalized: 0
    };
  }

  let warLog;

  try {
    warLog = await coc(
      env,
      `/clans/${encodeURIComponent(TAG)}/warlog?limit=50`
    );
  } catch (error) {
    return {
      kind: 'war_finalize',
      ok: false,
      pending: pending.length,
      finalized: 0,
      error: message(error)
    };
  }

  let finalized = 0;

  for (const row of pending) {
    const matched = matchWarLog(row.data, warLog);

    if (!matched) continue;

    const oldWar = row.data;

    const clan = {
      ...oldWar.clan,

      attacks:
        matched.ours.attacks ??
        oldWar.clan?.attacks,

      stars:
        matched.ours.stars ??
        oldWar.clan?.stars,

      destructionPercentage:
        matched.ours.destructionPercentage ??
        oldWar.clan?.destructionPercentage
    };

    const opponent = {
      ...oldWar.opponent,

      attacks:
        matched.theirs.attacks ??
        oldWar.opponent?.attacks,

      stars:
        matched.theirs.stars ??
        oldWar.opponent?.stars,

      destructionPercentage:
        matched.theirs.destructionPercentage ??
        oldWar.opponent?.destructionPercentage
    };

    const finalWar = {
      ...oldWar,
      state: 'warEnded',
      clan,
      opponent,
      finalResult: calculateWarResult(clan, opponent),
      finalSource: 'warlog'
    };

    await history(
      env.DB,
      'war',
      row.id,
      finalWar,
      now
    );

    // Update latest current war if it is the same war.
    const current = await readLatest(env.DB, 'currentwar');

    if (current?.startTime === oldWar.startTime) {
      await latest(
        env.DB,
        'currentwar',
        finalWar,
        now
      );
    }

    finalized++;
  }

  return {
    kind: 'war_finalize',
    ok: true,
    pending: pending.length,
    finalized
  };
}

// =====================================================
// CLAN - DIRECT API, NO D1 STORAGE
// =====================================================

async function getClan(env) {
  return coc(
    env,
    `/clans/${encodeURIComponent(TAG)}`
  );
}

// =====================================================
// CURRENT WAR - D1 STORAGE
// =====================================================

async function refreshCurrentWar(env, now) {
  try {
    const data = await coc(
      env,
      `/clans/${encodeURIComponent(TAG)}/currentwar`
    );

    await latest(
      env.DB,
      'currentwar',
      data,
      now
    );

    // Save regular war snapshots.
    if (
      data?.startTime &&
      data.state !== 'notInWar'
    ) {
      const id = `${TAG}:${data.startTime}`;

      const previous = await env.DB.prepare(`
        SELECT payload
        FROM history
        WHERE kind = 'war'
        AND record_id = ?
      `)
        .bind(id)
        .first();

      const oldWar = previous
        ? JSON.parse(previous.payload)
        : null;

      // Never overwrite finalized war.
      if (
        oldWar?.state !== 'warEnded' ||
        data.state === 'warEnded'
      ) {
        await history(
          env.DB,
          'war',
          id,
          data,
          now
        );
      }
    }

    return {
      kind: 'currentwar',
      ok: true,
      state: data?.state || 'unknown'
    };

  } catch (error) {
    return {
      kind: 'currentwar',
      ok: false,
      error: message(error)
    };
  }
}

// =====================================================
// CWL - CLAN WAR LEAGUE (D1 STORAGE)
// kind 'cwlgroup' = latest group (table latest)
// kind 'cwlwar'   = war per warTag (table history)
// =====================================================

async function refreshCwl(env, now) {
  try {
    let group;

    try {
      group = await coc(
        env,
        `/clans/${encodeURIComponent(TAG)}/currentwar/leaguegroup`
      );
    } catch (error) {
      // 404 = clan is not in a CWL right now
      if (error.status === 404) {
        return {
          kind: 'cwl',
          ok: true,
          state: 'notInWar'
        };
      }

      throw error;
    }

    await latest(env.DB, 'cwlgroup', group, now);

    // Load already saved CWL wars so ended ones are not fetched again.
    const { results } = await env.DB.prepare(`
      SELECT record_id, payload
      FROM history
      WHERE kind = 'cwlwar'
      ORDER BY updated_at DESC
      LIMIT 100
    `).all();

    const saved = new Map(
      results.map(row => [
        row.record_id,
        JSON.parse(row.payload)
      ])
    );

    const ownTag = tagKey(TAG);

    let fetched = 0;
    let stored = 0;

    for (const [index, round] of (group?.rounds || []).entries()) {
      for (const warTag of round?.warTags || []) {
        if (!warTag || warTag === '#0') continue;

        if (saved.get(warTag)?.war?.state === 'warEnded') {
          continue;
        }

        // Safety limit for subrequests per run.
        if (fetched >= 30) break;

        fetched++;

        let war;

        try {
          war = await coc(
            env,
            `/clanwarleagues/wars/${encodeURIComponent(warTag)}`
          );
        } catch (error) {
          continue;
        }

        const involvesUs =
          tagKey(war?.clan?.tag) === ownTag ||
          tagKey(war?.opponent?.tag) === ownTag;

        if (!involvesUs) continue;

        await history(
          env.DB,
          'cwlwar',
          warTag,
          {
            season: group.season,
            round: index + 1,
            warTag,
            war
          },
          now
        );

        stored++;
      }
    }

    return {
      kind: 'cwl',
      ok: true,
      state: group?.state || 'unknown',
      season: group?.season,
      fetched,
      stored
    };

  } catch (error) {
    return {
      kind: 'cwl',
      ok: false,
      error: message(error)
    };
  }
}

// =====================================================
// REFRESH WAR REGULAR + CWL
// =====================================================

async function refreshAll(env) {
  await init(env.DB);

  const now = new Date().toISOString();

  const current = await refreshCurrentWar(
    env,
    now
  );

  const finalized = await finalizeWar(
    env,
    now
  ).catch(error => ({
    kind: 'war_finalize',
    ok: false,
    error: message(error)
  }));

  const cwl = await refreshCwl(
    env,
    now
  );

  const results = [
    current,
    finalized,
    cwl
  ];

  return {
    updatedAt: now,
    ok: results.every(item => item.ok),
    results
  };
}

// =====================================================
// WORKER
// =====================================================

export default {

  // ===================================================
  // HTTP REQUEST
  // ===================================================

  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS
      });
    }

    if (request.method !== 'GET') {
      return json({
        error: 'Method not allowed'
      }, 405);
    }

    try {
      if (!env.DB) {
        return json({
          error: 'D1 binding missing'
        }, 500);
      }

      if (!env.COC_API_TOKEN) {
        return json({
          error: 'COC_API_TOKEN missing'
        }, 500);
      }

      const url = new URL(request.url);

      const path =
        url.pathname.replace(/\/$/, '') || '/';

      await init(env.DB);

      // ROOT
      if (path === '/') {
        return json({
          name: 'Balado API',
          mode: 'War Regular + CWL',
          endpoints: [
            '/health',
            '/clan',
            '/currentwar',
            '/api/currentwar',
            '/war/history',
            '/api/war/history',
            '/cwl',
            '/api/cwl',
            '/cwl/wars',
            '/api/cwl/wars'
          ]
        });
      }

      // HEALTH
      if (path === '/health') {
        return json({
          status: 'ok',
          d1: true,
          apiTokenConfigured: true,
          features: [
            'clan',
            'currentwar',
            'war_history',
            'war_finalize',
            'cwl',
            'cwl_wars'
          ]
        });
      }

      // CLAN - DIRECT API
      if (
        path === '/clan' ||
        path === '/api/clan'
      ) {
        return json(await getClan(env));
      }

      // CURRENT WAR - LATEST D1
      if (
        path === '/currentwar' ||
        path === '/api/currentwar'
      ) {
        const data = await readLatest(
          env.DB,
          'currentwar'
        );

        if (data === null) {
          return json({
            error: 'No saved war data yet'
          }, 404);
        }

        return json(data);
      }

      // WAR HISTORY - D1
      if (
        path === '/war/history' ||
        path === '/api/war/history'
      ) {
        const requestedLimit = Number.parseInt(
          url.searchParams.get('limit') || '20',
          10
        );

        const limit = Math.min(
          100,
          Math.max(1, requestedLimit || 20)
        );

        return json(
          await readHistory(
            env.DB,
            'war',
            limit
          )
        );
      }

      // CWL GROUP - LATEST D1
      if (
        path === '/cwl' ||
        path === '/api/cwl'
      ) {
        const data = await readLatest(
          env.DB,
          'cwlgroup'
        );

        if (data === null) {
          return json({
            error: 'No saved CWL data yet'
          }, 404);
        }

        return json(data);
      }

      // CWL WARS - D1
      if (
        path === '/cwl/wars' ||
        path === '/api/cwl/wars'
      ) {
        const requestedLimit = Number.parseInt(
          url.searchParams.get('limit') || '20',
          10
        );

        const limit = Math.min(
          100,
          Math.max(1, requestedLimit || 20)
        );

        return json(
          await readHistory(
            env.DB,
            'cwlwar',
            limit
          )
        );
      }

      // NOT FOUND
      return json({
        error: 'Not found'
      }, 404);

    } catch (error) {
      console.error('Request error', error);

      return json({
        error: 'Request failed',
        detail: message(error)
      }, error.status || 500);
    }
  },

  // ===================================================
  // SCHEDULED CRON
  // ===================================================

  async scheduled(controller, env) {
    try {
      if (!env.DB) {
        throw new Error('D1 binding missing');
      }

      const result = await refreshAll(env);

      console.log(
        'Balado War Refresh',
        JSON.stringify(result)
      );

      const failures = result.results.filter(
        item => !item.ok && item.kind === 'currentwar'
      );

      if (failures.length > 0) {
        throw new Error(
          'War refresh failed: ' +
          JSON.stringify(failures)
        );
      }

    } catch (error) {
      console.error(
        'Cron failed',
        error?.stack || message(error)
      );

      throw error;
    }
  }

};
