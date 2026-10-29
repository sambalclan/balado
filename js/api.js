import { dateFrom } from './constants.js';

// Worker proxy Clash of Clans
export const LIVE_API_URL = 'https://balado-war.sambalclash.workers.dev';
const LIVE_TIMEOUT_MS = 15000;

// Catatan setiap panggilan live; ditampilkan di halaman Settings
const liveLog = [];

const logLive = (path, status, note = '') => {
    liveLog.push({
        time: new Date().toLocaleTimeString('id-ID'),
        path,
        status,
        note
    });
};

export const getLiveLog = () => [...liveLog];

const liveCache = new Map();

// Hapus cache agar Refresh mengambil data terbaru
export const clearLiveCache = () => liveCache.clear();

function fetchLive(path, baseUrl = LIVE_API_URL) {
    if (!baseUrl) return Promise.resolve(null);

    // Cache dipisahkan berdasarkan alamat Worker dan endpoint
    const cacheKey = `${baseUrl.replace(/\/+$/, '')}${path}`;

    if (!liveCache.has(cacheKey)) {
        liveCache.set(cacheKey, (async () => {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), LIVE_TIMEOUT_MS);

            try {
                const res = await fetch(cacheKey, {
                    signal: ctl.signal
                });

                if (!res.ok) {
                    const body = await res.text().catch(() => '');

                    logLive(
                        path,
                        `HTTP ${res.status}`,
                        body.slice(0, 90)
                    );

                    return null;
                }

                logLive(path, 'OK');

                return await res.json();

            } catch (e) {
                logLive(
                    path,
                    'GAGAL',
                    `${e.name} ${e.message}`
                );

                return null;

            } finally {
                clearTimeout(timer);
            }
        })());
    }

    return liveCache.get(cacheKey);
}

async function fetchData(path) {
    const res = await fetch(`${path}?t=${Date.now()}`);

    if (!res.ok) {
        throw new Error(`Failed to fetch ${path}`);
    }

    return res.json();
}

const fetchIndex = (kind) =>
    fetchData(`data/${kind}_stats_index.json`);

const fetchStats = (kind, filename) =>
    fetchData(`data/${kind}_stats/${filename}`);

async function fetchLatest(kind) {
    for (const filename of (await fetchIndex(kind)) || []) {
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
        (await fetchLatest('clan'));

    if (!clan) {
        throw new Error(
            'No available clan data files found in index.'
        );
    }

    return clan;
}

export async function fetchClanHistory(days = 7) {
    const perDay = new Map();

    for (const filename of (await fetchIndex('clan')) || []) {
        const day = dateFrom(filename);

        if (!day || perDay.has(day)) continue;

        try {
            const d = await fetchStats('clan', filename);

            perDay.set(day, {
                members: d.members ?? d.memberList?.length ?? 0
            });

        } catch {
            // Lewati snapshot rusak
        }

        if (perDay.size >= days) break;
    }

    return [...perDay]
        .map(([date, v]) => ({ date, ...v }))
        .reverse();
}

// ─────────────────────────────────────────────
// WAR
// ─────────────────────────────────────────────

const liveWar = async () => {
    const w = await fetchLive('/currentwar');

    return w &&
        w.state &&
        w.state !== 'notInWar' &&
        w.startTime
        ? w
        : null;
};

const liveWarFile = (w) =>
    `war_${w.startTime}.json`;

export async function fetchWarIndex() {
    const index =
        (await fetchIndex('war').catch(() => [])) || [];

    const w = await liveWar();

    return w && !index.includes(liveWarFile(w))
        ? [...index, liveWarFile(w)]
        : index;
}

export async function fetchWarData(filename) {
    const w = await liveWar();

    if (w && liveWarFile(w) === filename) {
        return w;
    }

    return fetchStats('war', filename);
}

// ─────────────────────────────────────────────
// RAID
// ─────────────────────────────────────────────

const liveRaidFile = (r) =>
    `raid_${r.startTime}.json`;

export async function fetchLatestRaid() {
    return (
        (await fetchLive('/raid')) ||
        fetchLatest('raid')
    );
}

export async function fetchRaidIndex() {
    const index =
        (await fetchIndex('raid').catch(() => [])) || [];

    const r = await fetchLive('/raid');

    return r?.startTime &&
        !index.includes(liveRaidFile(r))
        ? [...index, liveRaidFile(r)]
        : index;
}

export async function fetchRaidData(filename) {
    const r = await fetchLive('/raid');

    if (r?.startTime && liveRaidFile(r) === filename) {
        return r;
    }

    return fetchStats('raid', filename);
}

// ─────────────────────────────────────────────
// MEMBER ACTIVITY — CLOUDFLARE D1
// ─────────────────────────────────────────────

// Mengambil aktivitas dari Worker balado-war,
// bukan dari Worker coc-proxy-sambal.
export const fetchActivity = () =>
    fetchLive('/activity', ACTIVITY_API_URL);

// ─────────────────────────────────────────────
// CWL
// ─────────────────────────────────────────────

export const fetchLatestCwl = async () =>
    (await fetchLive('/cwl')) ||
    fetchLatest('cwl').catch(() => null);