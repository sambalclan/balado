import { dateFrom } from './constants.js';

// ═══ Core ══════════════════════════════════════════════════════════════
async function fetchData(path) {
    const res = await fetch(`${path}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to fetch ${path}`);
    return res.json();
}

// Every kind (clan, war, raid, cwl) has data/<kind>_stats_index.json (newest first)
// and its files in data/<kind>_stats/
const fetchIndex = (kind) => fetchData(`data/${kind}_stats_index.json`);
const fetchStats = (kind, filename) => fetchData(`data/${kind}_stats/${filename}`);

// First file of the index that loads, or null
async function fetchLatest(kind) {
    for (const filename of (await fetchIndex(kind)) || []) {
        try { return await fetchStats(kind, filename); } catch { /* try next file */ }
    }
    return null;
}

// ═══ Clan ══════════════════════════════════════════════════════════════
export async function fetchClanData() {
    const clan = await fetchLatest('clan');
    if (!clan) throw new Error('No available clan data files found in index.');
    return clan;
}

// Member count per day (latest snapshot of each day; index is newest first)
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

// ═══ War ═══════════════════════════════════════════════════════════════
export const fetchWarIndex = () => fetchIndex('war');
export const fetchWarData = (filename) => fetchStats('war', filename);

// ═══ Raid ══════════════════════════════════════════════════════════════
export const fetchLatestRaid = () => fetchLatest('raid');
export const fetchRaidIndex = () => fetchIndex('raid');
export const fetchRaidData = (filename) => fetchStats('raid', filename);

// ═══ CWL ═══════════════════════════════════════════════════════════════
// Latest Clan War League season; null while there is no CWL data yet
export const fetchLatestCwl = () => fetchLatest('cwl').catch(() => null);
