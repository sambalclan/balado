import { dateFrom } from './constants.js';

// ─────────────────────────────────────────────
// WORKER CONFIGURATION
// ─────────────────────────────────────────────

// Worker utama: Clan, War, Raid + D1
export const LIVE_API_URL =
    'https://balado.sambalclash.workers.dev';

// Worker lama: Member Activity + CWL
export const ACTIVITY_API_URL =
    'https://api-tracker.sambalclash.workers.dev';

const CWL_API_URL = ACTIVITY_API_URL;

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

    // Batasi jumlah log
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
// LIVE API FETCH
// ─────────────────────────────────────────────

function fetchLive(path, baseUrl = LIVE_API_URL) {
    if (!baseUrl) {
        return Promise.resolve(null);
    }

    const cacheKey =
        `${baseUrl.replace(/\/+$/, '')}${path}`;

    if (!liveCache.has(cacheKey)) {
        const request = (async () => {
            const ctl = new AbortController();

            const timer = setTimeout(
                () => ctl.abort(),
                LIVE_TIMEOUT_MS
            );

            try {
                const res = await fetch(cacheKey, {
                    signal: ctl.signal,
                    headers: {
                        Accept: 'application/json'
                    }
                });

                if (!res.ok) {
                    const body = await res.text()
                        .catch(() => '');

                    logLive(
                        path,
                        `HTTP ${res.status}`,
                        body.slice(0, 90)
                    );

                    return null;
                }

                const data = await res.json();

                logLive(path, 'OK');

                return data;

            } catch (e) {
                logLive(
                    path,
                    'GAGAL',
                    `${e.name}: ${e.message}`
                );

                return null;

            } finally {
                clearTimeout(timer);
            }
        })();

        liveCache.set(cacheKey, request);

        // Jangan simpan hasil gagal selamanya
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

    const res = await fetch(
        `${path}${separator}t=${Date.now()}`
    );

    if (!res.ok) {
        throw new Error(
            `Failed to fetch ${path}: ${res.status}`
        );
    }

    return res.json();
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
            // Coba snapshot berikutnya
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

// Riwayat Clan tetap menggunakan snapshot lokal.
// Worker baru belum menyimpan riwayat harian Clan.
export async function fetchClanHistory(days = 7) {
    const perDay = new Map();

    const index = await fetchIndex('clan')
        .catch(() => []);

    for (const filename of index || []) {
        const day = dateFrom(filename);

        if (!day || perDay.has(day)) {
            continue;
        }

        try {
            const data = await fetchStats(
                'clan',
                filename
            );

            perDay.set(day, {
                members:
                    data.members ??
                    data.memberList?.length ??
                    0
            });

        } catch {
            // Lewati snapshot rusak
        }

        if (perDay.size >= days) {
            break;
        }
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

// Riwayat War dari D1
async function fetchWarHistoryD1() {
    const result = await fetchLive(
        '/api/war/history?limit=100'
    );

    if (!Array.isArray(result?.items)) {
        return [];
    }

    return result.items
        .map(item => item.data)
        .filter(war => war?.startTime);
}

export async function fetchWarIndex() {
    const localIndex = await fetchIndex('war')
        .catch(() => []);

    const history = await fetchWarHistoryD1();

    const d1Index = history.map(liveWarFile);

    const currentWar = await liveWar();

    const files = [
        ...localIndex,
        ...d1Index
    ];

    if (currentWar) {
        files.push(liveWarFile(currentWar));
    }

    return [...new Set(files)];
}

export async function fetchWarData(filename) {
    const currentWar = await liveWar();

    if (
        currentWar &&
        liveWarFile(currentWar) === filename
    ) {
        return currentWar;
    }

    // Cari di riwayat D1
    const history = await fetchWarHistoryD1();

    const savedWar = history.find(
        war => liveWarFile(war) === filename
    );

    if (savedWar) {
        return savedWar;
    }

    // Fallback ke JSON lokal
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

// Riwayat Raid dari D1
async function fetchRaidHistoryD1() {
    const result = await fetchLive(
        '/api/raid/history?limit=100'
    );

    if (!Array.isArray(result?.items)) {
        return [];
    }

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

    const d1Index = history.map(liveRaidFile);

    const currentRaid = await liveRaid();

    const files = [
        ...localIndex,
        ...d1Index
    ];

    if (currentRaid) {
        files.push(liveRaidFile(currentRaid));
    }

    return [...new Set(files)];
}

export async function fetchRaidData(filename) {
    const currentRaid = await liveRaid();

    if (
        currentRaid &&
        liveRaidFile(currentRaid) === filename
    ) {
        return currentRaid;
    }

    // Cari di riwayat D1
    const history = await fetchRaidHistoryD1();

    const savedRaid = history.find(
        raid => liveRaidFile(raid) === filename
    );

    if (savedRaid) {
        return savedRaid;
    }

    // Fallback ke JSON lokal
    return fetchStats('raid', filename);
}

// ─────────────────────────────────────────────
// MEMBER ACTIVITY
// ─────────────────────────────────────────────

// Tetap menggunakan Worker api-tracker.
// Worker Balado baru belum memiliki endpoint /activity.

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

    return fetchLive(
        '/activity',
        ACTIVITY_API_URL
    );
}

// ─────────────────────────────────────────────
// CWL
// ─────────────────────────────────────────────

// Tetap menggunakan Worker lama.
// Worker baru belum menyediakan endpoint /cwl.

export const fetchLatestCwl = async () =>
    (await fetchLive('/cwl', CWL_API_URL)) ||
    (await fetchLatest('cwl').catch(() => null));