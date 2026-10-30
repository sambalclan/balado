import { dateFrom } from './constants.js';

export const LIVE_API_URL = 'https://balado.sambalclash.workers.dev';
export const ACTIVITY_API_URL = LIVE_API_URL;

const cache = new Map();
const logs = [];
const TIMEOUT = 15000;
const ACTIVITY_TTL = 60000;
let activityTime = 0;

export const getLiveLog = () => [...logs];

export function clearLiveCache() {
    cache.clear();
    activityTime = 0;
}

function fetchLive(path) {
    const url = `${LIVE_API_URL}${path}`;
    if (cache.has(url)) return cache.get(url);

    const request = (async () => {
        try {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(TIMEOUT)
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status} ${text.slice(0, 90)}`);
            }

            const data = await res.json();
            logs.push({ time: new Date().toLocaleTimeString('id-ID'), path, status: 'OK', note: '' });
            return data;
        } catch (e) {
            logs.push({
                time: new Date().toLocaleTimeString('id-ID'),
                path,
                status: e.message.startsWith('HTTP') ? e.message.split(' ').slice(0, 2).join(' ') : 'GAGAL',
                note: e.message.slice(0, 100)
            });
            cache.delete(url);
            return null;
        } finally {
            if (logs.length > 100) logs.splice(0, logs.length - 100);
        }
    })();

    cache.set(url, request);
    return request;
}

async function local(path) {
    const res = await fetch(`${path}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
    return res.json();
}

const index = kind => local(`data/${kind}_stats_index.json`);
const stats = (kind, file) => local(`data/${kind}_stats/${file}`);

async function latest(kind) {
    for (const file of await index(kind).catch(() => [])) {
        try { return await stats(kind, file); } catch {}
    }
    return null;
}

async function history(kind) {
    const data = await fetchLive(`/api/${kind}/history?limit=100`);
    return (data?.items || []).map(x => x.data).filter(x => x?.startTime);
}

const fileName = (kind, data) => `${kind}_${data.startTime}.json`;

async function combinedIndex(kind, current) {
    const [files, saved, live] = await Promise.all([
        index(kind).catch(() => []),
        history(kind),
        current()
    ]);

    return [...new Set([
        ...files,
        ...saved.map(x => fileName(kind, x)),
        ...(live ? [fileName(kind, live)] : [])
    ])].sort().reverse();
}

async function combinedData(kind, filename, current) {
    const live = await current();
    if (live && fileName(kind, live) === filename) return live;

    const saved = await history(kind);
    return saved.find(x => fileName(kind, x) === filename)
        || stats(kind, filename);
}

const currentWar = async () => {
    const war = await fetchLive('/currentwar');
    return war?.startTime && war.state !== 'notInWar' ? war : null;
};

const currentRaid = async () => {
    const raid = await fetchLive('/raid');
    return raid?.startTime ? raid : null;
};

export async function fetchClanData() {
    const data = await fetchLive('/clan') || await latest('clan');
    if (!data) throw new Error('Clan data unavailable');
    return data;
}

export async function fetchClanHistory(days = 7) {
    const result = new Map();

    for (const file of await index('clan').catch(() => [])) {
        const date = dateFrom(file);
        if (!date || result.has(date)) continue;

        try {
            const data = await stats('clan', file);
            result.set(date, { members: data.members ?? data.memberList?.length ?? 0 });
        } catch {}

        if (result.size >= days) break;
    }

    return [...result].map(([date, data]) => ({ date, ...data })).reverse();
}

export const fetchWarIndex = () => combinedIndex('war', currentWar);
export const fetchWarData = file => combinedData('war', file, currentWar);

export const fetchLatestRaid = async () =>
    await currentRaid() || latest('raid');

export const fetchRaidIndex = () => combinedIndex('raid', currentRaid);
export const fetchRaidData = file => combinedData('raid', file, currentRaid);

export function fetchActivity() {
    if (Date.now() - activityTime >= ACTIVITY_TTL) {
        cache.delete(`${ACTIVITY_API_URL}/activity`);
        activityTime = Date.now();
    }
    return fetchLive('/activity');
}

export const fetchLatestCwl = async () =>
    await fetchLive('/cwl') || latest('cwl');