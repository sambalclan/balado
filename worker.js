const BASE = 'https://cocproxy.royaleapi.dev/v1';
const TAG = '#2RVRP900V';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

const json = (value, status = 200) => {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
};

const message = e => String(e?.message || e);

const tagKey = tag => {
  return String(tag || '')
    .replace(/^#/, '')
    .toUpperCase();
};

function parseCoCTime(value) {
  if (!value) return NaN;

  const match = String(value).match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/
  );

  if (!match) {
    return Date.parse(value);
  }

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
// DATABASE
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
    INSERT INTO latest (
      kind,
      payload,
      updated_at
    )
    VALUES (?, ?, ?)
    ON CONFLICT(kind)
    DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `)
    .bind(
      kind,
      JSON.stringify(payload),
      now
    )
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
    .bind(
      kind,
      id,
      JSON.stringify(payload),
      now
    )
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

  return row
    ? JSON.parse(row.payload)
    : null;
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

  if (!Number.isFinite(targetEnd)) {
    return null;
  }

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

    if (!sameTeams) {
      continue;
    }

    const logEnd = parseCoCTime(entry.endTime);

    if (!Number.isFinite(logEnd)) {
      continue;
    }

    const difference = Math.abs(
      logEnd - targetEnd
    );

    // Prevent matching a different war
    // against the same opponent.
    if (difference > 600000) {
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

  if (clanStars > enemyStars) {
    return 'win';
  }

  if (clanStars < enemyStars) {
    return 'lose';
  }

  const clanDestruction = Number(
    clan?.destructionPercentage ?? 0
  );

  const enemyDestruction = Number(
    opponent?.destructionPercentage ?? 0
  );

  if (clanDestruction > enemyDestruction) {
    return 'win';
  }

  if (clanDestruction < enemyDestruction) {
    return 'lose';
  }

  return 'tie';
}

// =====================================================
// AUTOMATIC WAR FINALIZATION
// =====================================================

async function finalizeWar(env, now) {
  const { results } = await env.DB.prepare(`
    SELECT
      record_id,
      payload
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

      if (!war?.startTime) {
        return false;
      }

      if (war.state === 'warEnded') {
        return false;
      }

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
    const matched = matchWarLog(
      row.data,
      warLog
    );

    if (!matched) {
      continue;
    }

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

    const finalResult = calculateWarResult(
      clan,
      opponent
    );

    const finalWar = {
      ...oldWar,

      state: 'warEnded',

      clan,
      opponent,

      finalResult,
      finalSource: 'warlog'
    };

    await history(
      env.DB,
      'war',
      row.id,
      finalWar,
      now
    );

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
// CLAN, CURRENT WAR, RAID
// =====================================================

async function refreshClanWarRaid(env, now) {
  const tag = encodeURIComponent(TAG);

  const paths = {
    clan: `/clans/${tag}`,

    currentwar: `/clans/${tag}/currentwar`,

    raid: `/clans/${tag}/capitalraidseasons?limit=5`
  };

  return Promise.all(
    Object.entries(paths).map(
      async ([kind, path]) => {
        try {
          const raw = await coc(env, path);

          const data =
            kind === 'raid'
              ? raw.items?.[0] ?? null
              : raw;

          await latest(
            env.DB,
            kind,
            data,
            now
          );

          // Save normal war snapshots.
          if (
            kind === 'currentwar' &&
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

            // Never overwrite finalized war history
            // with stale preparation/inWar data.
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

          // Save raid history.
          if (kind === 'raid') {
            for (const item of raw.items || []) {
              if (!item.startTime) {
                continue;
              }

              await history(
                env.DB,
                'raid',
                item.startTime,
                item,
                now
              );
            }
          }

          return {
            kind,
            ok: true
          };

        } catch (error) {
          return {
            kind,
            ok: false,
            error: message(error)
          };
        }
      }
    )
  );
}

// =====================================================
// CWL
// =====================================================

async function refreshCwl(env, now) {
  let group;

  try {
    group = await coc(
      env,
      `/clans/${encodeURIComponent(TAG)}/currentwar/leaguegroup`
    );

  } catch (error) {
    // A 404 is expected when there is no active
    // CWL league group.
    if (error.status === 404) {
      return {
        kind: 'cwl',
        ok: true,
        skipped: true,
        reason: 'No active CWL group'
      };
    }

    throw error;
  }

  if (!group || !Array.isArray(group.rounds)) {
    return {
      kind: 'cwl',
      ok: true,
      skipped: true,
      reason: 'CWL group data unavailable'
    };
  }

  await latest(
    env.DB,
    'cwl_group',
    group,
    now
  );

  const season = group.season || 'unknown';

  await history(
    env.DB,
    'cwl_group',
    season,
    group,
    now
  );

  const rounds = [];

  let saved = 0;

  for (
    let i = 0;
    i < group.rounds.length;
    i++
  ) {
    const tags =
      group.rounds[i]?.warTags || [];

    let ownWar = null;

    for (const warTag of tags) {
      if (
        !warTag ||
        warTag === '#0'
      ) {
        continue;
      }

      try {
        const war = await coc(
          env,
          `/clanwarleagues/wars/${encodeURIComponent(warTag)}`
        );

        const isOurWar =
          tagKey(war.clan?.tag) === tagKey(TAG) ||
          tagKey(war.opponent?.tag) === tagKey(TAG);

        if (!isOurWar) {
          continue;
        }

        ownWar = war;

        await history(
          env.DB,
          'cwl',
          `${season}:round_${i + 1}`,
          war,
          now
        );

        saved++;

        break;

      } catch (error) {
        console.warn(
          'CWL war unavailable',
          warTag,
          message(error)
        );
      }
    }

    rounds.push({
      round: i + 1,
      war: ownWar
    });
  }

  const data = {
    season,
    state: group.state,
    group,
    rounds
  };

  await latest(
    env.DB,
    'cwl',
    data,
    now
  );

  return {
    kind: 'cwl',
    ok: true,
    savedRounds: saved
  };
}

// =====================================================
// REFRESH ALL
// =====================================================

async function refreshAll(env) {
  await init(env.DB);

  const now = new Date().toISOString();

  const base = await refreshClanWarRaid(
    env,
    now
  );

  const extras = await Promise.all([
    finalizeWar(env, now).catch(error => ({
      kind: 'war_finalize',
      ok: false,
      error: message(error)
    })),

    refreshCwl(env, now).catch(error => ({
      kind: 'cwl',
      ok: false,
      error: message(error)
    }))
  ]);

  const results = [
    ...base,
    ...extras
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

      const url = new URL(request.url);

      const path =
        url.pathname.replace(/\/$/, '') || '/';

      if (path === '/') {
        return json({
          name: 'Balado API',

          endpoints: [
            '/health',
            '/clan',
            '/currentwar',
            '/raid',
            '/cwl',
            '/cwl/groups',
            '/api/war/history',
            '/war/history',
            '/api/raid/history',
            '/api/cwl/history'
          ]
        });
      }

      await init(env.DB);

      // ===============================================
      // HEALTH
      // ===============================================

      if (path === '/health') {
        return json({
          status: 'ok',
          d1: true,
          apiTokenConfigured: !!env.COC_API_TOKEN
        });
      }

      // ===============================================
      // LATEST DATA ROUTES
      // ===============================================

      const routes = {
        '/clan': 'clan',
        '/currentwar': 'currentwar',
        '/raid': 'raid',
        '/cwl': 'cwl',
        '/cwl/groups': 'cwl_group',

        '/api/clan': 'clan',
        '/api/currentwar': 'currentwar',
        '/api/raid': 'raid',
        '/api/cwl': 'cwl'
      };

      const route = routes[path];

      if (route) {
        const data = await readLatest(
          env.DB,
          route
        );

        if (data === null) {
          return json({
            error: 'No saved data yet'
          }, 404);
        }

        return json(data);
      }

      // ===============================================
      // HISTORY ROUTES
      // ===============================================

      const historyRoutes = {
        '/api/war/history': 'war',
        '/war/history': 'war',

        '/api/raid/history': 'raid',
        '/raid/history': 'raid',

        '/api/cwl/history': 'cwl',
        '/cwl/history': 'cwl'
      };

      const kind = historyRoutes[path];

      if (kind) {
        const requestedLimit = Number.parseInt(
          url.searchParams.get('limit') || '20',
          10
        );

        const limit = Math.min(
          100,
          Math.max(
            1,
            requestedLimit || 20
          )
        );

        const data = await readHistory(
          env.DB,
          kind,
          limit
        );

        return json(data);
      }

      // ===============================================
      // NOT FOUND
      // ===============================================

      return json({
        error: 'Not found'
      }, 404);

    } catch (error) {
      console.error(
        'Request error',
        error
      );

      return json({
        error: 'Request failed',
        detail: message(error)
      }, 500);
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
        'Balado scheduled refresh',
        JSON.stringify(result)
      );

      const coreFailures = result.results.filter(
        item =>
          !item.ok &&
          ![
            'cwl',
            'war_finalize'
          ].includes(item.kind)
      );

      if (coreFailures.length > 0) {
        throw new Error(
          'Core refresh failed: ' +
          JSON.stringify(coreFailures)
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