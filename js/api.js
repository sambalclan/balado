export async function fetchData(path) {
    const res = await fetch(`${path}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to fetch ${path}`);
    return res.json();
}

// Newest-first indexes: return the first file that loads
export async function fetchClanData() {
    const index = await fetchData('data/clan_stats_index.json');
    if (!index || index.length === 0) throw new Error('Clan index is empty');
    for (const filename of index) {
        try { return await fetchData(`data/clan_stats/${filename}`); } catch { /* try next file */ }
    }
    throw new Error('No available clan data files found in index.');
}

export const fetchWarIndex = () => fetchData('data/war_stats_index.json');
export const fetchWarData = (filename) => fetchData(`data/war_stats/${filename}`);

// Member count per day (latest snapshot of each day; index is newest first)
export async function fetchClanHistory(days = 7) {
    const index = await fetchData('data/clan_stats_index.json');
    const perDay = new Map();

    for (const filename of index || []) {
        const day = (String(filename).match(/(\d{4})-?(\d{2})-?(\d{2})/) || []).slice(1, 4).join('-');
        if (day.length !== 10 || perDay.has(day)) continue;
        try {
            const d = await fetchData(`data/clan_stats/${filename}`);
            perDay.set(day, { members: d.members ?? d.memberList?.length ?? 0 });
        } catch { /* skip broken snapshot */ }
        if (perDay.size >= days) break;
    }
    return [...perDay].map(([date, v]) => ({ date, ...v })).reverse();
}

// Latest capital raid weekend (index is newest first)
export async function fetchLatestRaid() {
    const index = await fetchData('data/raid_stats_index.json');
    for (const filename of index || []) {
        try { return await fetchData(`data/raid_stats/${filename}`); } catch { /* try next file */ }
    }
    return null;
}

// All capital raid weekends (index is newest first)
export const fetchRaidIndex = () => fetchData('data/raid_stats_index.json');
export const fetchRaidData = (filename) => fetchData(`data/raid_stats/${filename}`);

// Latest Clan War League season (index is newest first); null while there is no CWL data yet
export async function fetchLatestCwl() {
    try {
        const index = await fetchData('data/cwl_stats_index.json');
        for (const filename of index || []) {
            try { return await fetchData(`data/cwl_stats/${filename}`); } catch { /* try next file */ }
        }
    } catch { /* no CWL index yet */ }
    return null;
}
