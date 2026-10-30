import { dateFrom } from './constants.js';

// ─────────────────────────────────────────────
// API CONFIGURATION
// ─────────────────────────────────────────────

export const LIVE_API_URL =
    'https://balado.sambalclash.workers.dev';

export const ACTIVITY_API_URL =
    'https://api-tracker.sambalclash.workers.dev';

const LIVE_TIMEOUT_MS = 15000;
const ACTIVITY_CACHE_TTL_MS = 60_000;

// ─────────────────────────────────────────────
// LIVE LOG
// ─────────────────────────────────────────────

const liveLog = [];

const logLive = (path, status, note = '') => {
    liveLog.push({
        time: new Date().toLocaleTimeString('id-ID'),
        path,
        status,
        note
    });

    if (liveLog.length > 100) {
        liveLog.shift();
    }
};

export const getLiveLog = () => [...liveLog];

// ─────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────

const liveCache = new Map();
let activityCacheTime = 0;

export const clearLiveCache = () => {
    liveCache.clear();
    activityCacheTime = 0;
};

// ─────────────────────────────────────────────
// LIVE FETCH
// ─────────────────────────────────────────────

function fetchLive(path, baseUrl = LIVE_API_URL) {
    if (!baseUrl) return Promise.resolve(null);

    const cacheKey =
        `${baseUrl.replace(/\/+$/, '')}${path}`;

    if (!liveCache.has(cacheKey)) {
        const request = (async () => {
            const controller = new AbortController();

            const timer = setTimeout(
                () => controller.abort(),
                LIVE_TIMEOUT_MS
            );

            try {
                const response = await fetch(cacheKey, {
                    signal: controller.signal,
                    headers: {
                        Accept: 'application/json'
                    }
                });

                if (!response.ok) {
                    const body = await response.text()
                        .catch(() => '');

                    logLive(
                        path,
                        `HTTP ${response.status}`,
                        body.slice(0, 90)
                    );

                    return null;
                }

                const data = await response.json();

                logLive(path, 'OK');
                return data;

            } catch (error) {
                logLive(
                    path,
                    'GAGAL',
                    `${error.name}: ${error.message}`
                );

                return null;

            } finally {
                clearTimeout(timer);
            }
        })();

        liveCache.set(cacheKey, request);

        request.then(result => {
            if (result === null) {
                liveCache.delete(cacheKey);
            }
        });
    }

    return liveCache.get(cacheKey);
}

// ─────────────────────────────────────────────
// LOCAL JSON FALLBACK
// ─────────────────────────────────────────────

async function fetchData(path) {
    const separator = path.includes('?') ? '&' : '?';

    const response = await fetch(
        `${path}${separator}t=${Date.now()}`
    );

    if (!response.ok) {
        throw new Error(
            `Failed to fetch ${path}: ${response.status}`
        );
    }

    return response.json();
}

const fetchIndex = kind =>
    fetchData(`data/${kind}_stats_index.json`);

const fetchStats = (kind, filename) =>
    fetchData(`data/${kind}_stats/${filename}`);

async function fetchLatest(kind) {
    const index = await fetchIndex(kind);

    for (const filename of index || []) {
        try {
            return await fetchStats(kind, filename);
        } catch {
            // Coba file berikutnya
        }
    }

    return null;
}

// ─────────────────────────────────────────────
// CLAN
// ─────────────────────────────────────────────

export async function fetchClanData() {
    const clan =
        (await fetchLive('/clan')) ||
        (await fetchLatest('clan').catch(() => null));

    if (!clan) {
        throw new Error(
            'Clan data unavailable from Worker and local files.'
        );
    }

    return clan;
}

export async function fetchClanHistory(days = 7) {
    const perDay = new Map();

    const index = await fetchIndex('clan')
        .catch(() => []);

    for (const filename of index || []) {
        const day = dateFrom(filename);

        if (!day || perDay.has(day)) continue;

        try {
            const data = await fetchStats('clan', filename);

            perDay.set(day, {
                members:
                    data.members ??
                    data.memberList?.length ??
                    0
            });
        } catch {
            // Lewati snapshot rusak
        }

        if (perDay.size >= days) break;
    }

    return [...perDay]
        .map(([date, value]) => ({
            date,
            ...value
        }))
        .reverse();
}

// ─────────────────────────────────────────────
// WAR
// ─────────────────────────────────────────────

const liveWar = async () => {
    const war = await fetchLive('/currentwar');

    return war &&
        war.state &&
        war.state !== 'notInWar' &&
        war.startTime
        ? war
        : null;
};

const liveWarFile = war =>
    `war_${war.startTime}.json`;

async function fetchWarHistoryD1() {
    const result = await fetchLive(
        '/api/war/history?limit=100'
    );

    if (!Array.isArray(result?.items)) return [];

    return result.items
        .map(item => item.data)
        .filter(war => war?.startTime);
}

export async function fetchWarIndex() {
    const localIndex = await fetchIndex('war')
        .catch(() => []);

    const history = await fetchWarHistoryD1();
    const currentWar = await liveWar();

    const files = [
        ...history.map(liveWarFile),
        ...localIndex
    ];

    if (currentWar) {
        files.push(liveWarFile(currentWar));
    }

    return [...new Set(files)].sort().reverse();
}

export async function fetchWarData(filename) {
    const currentWar = await liveWar();

    if (
        currentWar &&
        liveWarFile(currentWar) === filename
    ) {
        return currentWar;
    }

    const history = await fetchWarHistoryD1();

    const savedWar = history.find(
        war => liveWarFile(war) === filename
    );

    if (savedWar) return savedWar;

    return fetchStats('war', filename);
}

// ─────────────────────────────────────────────
// RAID
// ─────────────────────────────────────────────

const liveRaidFile = raid =>
    `raid_${raid.startTime}.json`;

const liveRaid = async () => {
    const raid = await fetchLive('/raid');

    return raid?.startTime ? raid : null;
};

async function fetchRaidHistoryD1() {
    const result = await fetchLive(
        '/api/raid/history?limit=100'
    );

    if (!Array.isArray(result?.items)) return [];

    return result.items
        .map(item => item.data)
        .filter(raid => raid?.startTime);
}

export async function fetchLatestRaid() {
    return (
        (await liveRaid()) ||
        (await fetchLatest('raid').catch(() => null))
    );
}

export async function fetchRaidIndex() {
    const localIndex = await fetchIndex('raid')
        .catch(() => []);

    const history = await fetchRaidHistoryD1();
    const currentRaid = await liveRaid();

    const files = [
        ...history.map(liveRaidFile),
        ...localIndex
    ];

    if (currentRaid) {
        files.push(liveRaidFile(currentRaid));
    }

    return [...new Set(files)].sort().reverse();
}

export async function fetchRaidData(filename) {
    const currentRaid = await liveRaid();

    if (
        currentRaid &&
        liveRaidFile(currentRaid) === filename
    ) {
        return currentRaid;
    }

    const history = await fetchRaidHistoryD1();

    const savedRaid = history.find(
        raid => liveRaidFile(raid) === filename
    );

    if (savedRaid) return savedRaid;

    return fetchStats('raid', filename);
}

// ─────────────────────────────────────────────
// MEMBER ACTIVITY
// ─────────────────────────────────────────────

export async function fetchActivity() {
    const cacheKey =
        `${ACTIVITY_API_URL.replace(/\/+$/, '')}/activity`;

    const now = Date.now();

    if (
        !activityCacheTime ||
        now - activityCacheTime >= ACTIVITY_CACHE_TTL_MS
    ) {
        liveCache.delete(cacheKey);
        activityCacheTime = now;
    }

    return fetchLive('/activity', ACTIVITY_API_URL);
}

// ─────────────────────────────────────────────
// CWL
// ─────────────────────────────────────────────

// Worker baru belum mendukung CWL.
// Gunakan data JSON lokal tanpa memanggil endpoint /cwl.

export const fetchLatestCwl = async () =>
    fetchLatest('cwl').catch(() => null);