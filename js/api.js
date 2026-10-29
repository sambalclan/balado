import { dateFrom } from './constants.js';

// Alamat Worker proxy. Kosongkan ('') untuk memakai file JSON saja.
export const LIVE_API_URL = 'https://coc-proxy-sambal.sambalclash.workers.dev';
const LIVE_TIMEOUT_MS = 8000;

// Catatan setiap panggilan live; ditampilkan di halaman Settings
const liveLog = [];
const logLive = (path, status, note = '') => {
    liveLog.push({ time: new Date().toLocaleTimeString('id-ID'), path, status, note });
};
export const getLiveLog = () => [...liveLog];

const liveCache = new Map();
// Forget cached live responses so the next fetch hits the Worker again (used by Refresh)
export const clearLiveCache = () => liveCache.clear();
function fetchLive(path) {
    if (!LIVE_API_URL) return Promise.resolve(null);
    if (!liveCache.has(path)) {
        liveCache.set(path, (async () => {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), LIVE_TIMEOUT_MS);
            try {
                const res = await fetch(`${LIVE_API_URL.replace(/\/+$/, '')}${path}`, { signal: ctl.signal });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    logLive(path, `HTTP ${res.status}`, body.slice(0, 90));
                    return null;
                }
                logLive(path, 'OK');
                return await res.json();
            } catch (e) {
                logLive(path, 'GAGAL', `${e.name} ${e.message}`);
                return null;
            } finally {
                clearTimeout(timer);
            }
        })());
    }
    return liveCache.get(path);
}

async function fetchData(path) {
    const res = await fetch(`${path}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to fetch ${path}`);
    return res.json();
}

const fetchIndex = (kind) => fetchData(`data/${kind}_stats_index.json`);
const fetchStats = (kind, filename) => fetchData(`data/${kind}_stats/${filename}`);

async function fetchLatest(kind) {
    for (const filename of (await fetchIndex(kind)) || []) {
        try { return await fetchStats(kind, filename); } catch { /* try next file */ }
    }
    return null;
}

// Clan
export async function fetchClanData() {
    const clan = (await fetchLive('/clan')) || (await fetchLatest('clan'));
    if (!clan) throw new Error('No available clan data files found in index.');
    return clan;
}

export async function fetchClanHistory(days = 14) {
    const files = new Map(); // one snapshot per day, newest first
    for (const filename of (await fetchIndex('clan')) || []) {
        const day = dateFrom(filename);
        if (day && !files.has(day)) files.set(day, filename);
        if (files.size >= days) break;
    }

    const entries = [...files];
    const results = await Promise.allSettled(entries.map(([, filename]) => fetchStats('clan', filename)));

    return entries.map(([date], i) => {
        if (results[i].status !== 'fulfilled') return null; // skip broken snapshot
        const d = results[i].value;
        return {
            date,
            members: d.members ?? d.memberList?.length ?? 0,
            // only what the activity check needs
            list: (d.memberList || []).map((m) => ({
                tag: m.tag, donations: m.donations || 0, trophies: m.trophies || 0, expLevel: m.expLevel || 0,
            })),
        };
    }).filter(Boolean).reverse();
}

// War
const liveWar = async () => {
    const w = await fetchLive('/currentwar');
    return w && w.state && w.state !== 'notInWar' && w.startTime ? w : null;
};
const liveWarFile = (w) => `war_${w.startTime}.json`;

export async function fetchWarIndex() {
    const index = (await fetchIndex('war').catch(() => [])) || [];
    const w = await liveWar();
    return w && !index.includes(liveWarFile(w)) ? [...index, liveWarFile(w)] : index;
}

export async function fetchWarData(filename) {
    const w = await liveWar();
    if (w && liveWarFile(w) === filename) return w;
    return fetchStats('war', filename);
}

// Raid
const liveRaidFile = (r) => `raid_${r.startTime}.json`;

export async function fetchLatestRaid() {
    return (await fetchLive('/raid')) || fetchLatest('raid');
}

export async function fetchRaidIndex() {
    const index = (await fetchIndex('raid').catch(() => [])) || [];
    const r = await fetchLive('/raid');
    return r?.startTime && !index.includes(liveRaidFile(r)) ? [...index, liveRaidFile(r)] : index;
}

export async function fetchRaidData(filename) {
    const r = await fetchLive('/raid');
    if (r?.startTime && liveRaidFile(r) === filename) return r;
    return fetchStats('raid', filename);
}

// CWL
export const fetchLatestCwl = async () =>
    (await fetchLive('/cwl')) || fetchLatest('cwl').catch(() => null);