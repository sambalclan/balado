import { dateFrom } from './constants.js';

// Alamat Worker proxy. Kosongkan ('') untuk memakai file JSON saja.
export const LIVE_API_URL = 'https://baladoo.augustasophia1338.workers.dev';
const LIVE_TIMEOUT_MS = 8000;

<<<<<<< HEAD
const liveLog = [];
function showLiveStatus(text) {
    try {
        liveLog.push(text);
=======
function showLiveStatus(text) {
    try {
>>>>>>> a4ff4d4abed010bf078e54489706cfb670c917c8
        let el = document.getElementById('liveStatus');
        if (!el) {
            el = document.createElement('div');
            el.id = 'liveStatus';
<<<<<<< HEAD
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#000;color:#0f0;font:11px monospace;padding:2px 6px;word-break:break-all;';
            document.body.appendChild(el);
        }
        el.textContent = liveLog.join(' | ');
=======
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#000;color:#0f0;font:11px monospace;padding:2px 6px;';
            document.body.appendChild(el);
        }
        el.textContent = text;
>>>>>>> a4ff4d4abed010bf078e54489706cfb670c917c8
    } catch { /* abaikan */ }
}

const liveCache = new Map();
function fetchLive(path) {
    if (!LIVE_API_URL) return Promise.resolve(null);
    if (!liveCache.has(path)) {
        liveCache.set(path, (async () => {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), LIVE_TIMEOUT_MS);
            try {
                const res = await fetch(`${LIVE_API_URL.replace(/\/+$/, '')}${path}`, { signal: ctl.signal });
<<<<<<< HEAD
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    showLiveStatus(`${path}: HTTP ${res.status} ${body.slice(0, 90)}`);
                    return null;
                }
                showLiveStatus(`${path}: OK`);
                return await res.json();
            } catch (e) {
                showLiveStatus(`${path} GAGAL: ${e.name} ${e.message}`);
=======
                showLiveStatus(`LIVE ${path}: HTTP ${res.status}`);
                return res.ok ? await res.json() : null;
            } catch (e) {
                showLiveStatus(`LIVE ${path} GAGAL: ${e.name} ${e.message}`);
>>>>>>> a4ff4d4abed010bf078e54489706cfb670c917c8
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

export async function fetchClanHistory(days = 7) {
    const perDay = new Map();

    for (const filename of (await fetchIndex('clan')) || []) {
        const day = dateFrom(filename);
        if (!day || perDay.has(day)) continue;
        try {
            const d = await fetchStats('clan', filename);
            perDay.set(day, { members: d.members ?? d.memberList?.length ?? 0 });
        } catch { /* skip broken snapshot */ }
        if (perDay.size >= days) break;
    }
    return [...perDay].map(([date, v]) => ({ date, ...v })).reverse();
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