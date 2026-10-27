import { state } from './state.js';
import { roleName, getTHImage, escapeHtml, warDate } from './constants.js';
import { fmt, dayLabel } from './chart.js';

const PASS_SCORE = 100; // total score (%) that means every target is met
const TOP_COUNT = 5;    // how many candidates to show
const NEXT_ROLE = { member: 'admin', admin: 'coLeader' };

// ── Season ──
// A season follows the calendar month and resets on the 1st at 08:00 UTC (15:00 WIB).
// Donations reset then, so wars and raids are only counted from that day on.
const seasonDate = (now = new Date()) => {
    const y = now.getUTCFullYear(), m = now.getUTCMonth();
    const thisMonth = new Date(Date.UTC(y, m, 1, 8));
    return (now >= thisMonth ? thisMonth : new Date(Date.UTC(y, m - 1, 1, 8))).toISOString().slice(0, 10); // YYYY-MM-DD
};

const inSeason = (record) => warDate(record) >= seasonDate();

const endedWars = () =>
    state.wars.filter((w) => ['warEnded', 'ended'].includes(w.state) && inSeason(w));
const raidWeeks = () =>
    (state.raids.length ? state.raids : (state.raid ? [state.raid] : [])).filter(inSeason);

// Sum a per-member value over a list of war/raid records, keyed by member tag
const sumByTag = (records, getMembers, getValue) => {
    const totals = new Map();
    records.forEach((rec) => getMembers(rec).forEach((m) => {
        totals.set(m.tag, (totals.get(m.tag) || 0) + getValue(m));
    }));
    return totals;
};

const donationValues = () =>
    new Map((state.clan?.memberList || []).map((m) => [m.tag, m.donations || 0]));

const warValues = () => {
    const wars = endedWars();
    return wars.length
        ? sumByTag(wars, (w) => w.clan?.members || [],
            (m) => (m.attacks || []).reduce((n, a) => n + (a.stars || 0), 0))
        : null;
};

const raidValues = () => {
    const weeks = raidWeeks();
    return weeks.length
        ? sumByTag(weeks, (w) => w.members || [], (m) => m.capitalResourcesLooted || 0)
        : null;
};

// CWL stars (3 per round x 7 rounds = 21), only from the CWL season of the current month
const cwlValues = () => {
    const cwl = state.cwl;
    if (!cwl || cwl.season !== seasonDate().slice(0, 7)) return null;
    return new Map((cwl.members || []).map((m) => [m.tag, m.stars || 0]));
};

// Number of finished wars this member was in the lineup
const warJoined = (tag) =>
    endedWars().filter((w) => (w.clan?.members || []).some((m) => m.tag === tag)).length;

// values() returns Map(tag -> value), or null when there is no data (category is skipped)
const CATEGORIES = [
    { id: 'donations', label: 'Donasi', icon: 'volunteer_activism', target: 24000, weight: 20, values: donationValues },
    { id: 'war',       label: 'War',    icon: 'swords',             target: 72,    weight: 30, values: warValues },
    { id: 'raid',      label: 'Raid',   icon: 'savings',            target: 80000, weight: 25, values: raidValues },
    { id: 'cwl',       label: 'CWL',    icon: 'shield',             target: 21,    weight: 25, values: cwlValues },
];

function scoreMembers() {
    const cats = CATEGORIES.map((c) => ({ ...c, map: c.values() })).filter((c) => c.map);
    const totalWeight = cats.reduce((n, c) => n + c.weight, 0);
    if (!totalWeight) return { cats, rows: [] };

    const rows = (state.clan?.memberList || [])
        .filter((m) => NEXT_ROLE[m.role])
        .map((m) => {
            const parts = cats.map((c) => {
                const value = c.map.get(m.tag) || 0;
                return {
                    label: c.label,
                    icon: c.icon,
                    value,
                    target: c.target,
                    pct: Math.min(value / c.target, 1),
                };
            });
            const score = parts.reduce((n, p, i) => n + p.pct * cats[i].weight, 0) / totalWeight * 100;
            const joined = cats.some((c) => c.id === 'war') ? `Ikut ${warJoined(m.tag)}/${endedWars().length} war` : '';
            return { member: m, parts, score, joined };
        })
        .sort((a, b) => b.score - a.score);

    return { cats, rows };
}

// One category: icon + label + %, progress bar, value/target
const renderPart = (p, compact) => {
    const done = p.pct >= 1;
    return `
        <div class="min-w-0">
            <div class="flex items-center justify-between gap-1">
                <span class="flex items-center gap-0.5 text-[8px] font-semibold tracking-wide uppercase text-[#8B8F98]">
                    ${compact ? '' : `<span class="material-symbols-outlined text-[11px]">${p.icon}</span>`}${p.label}
                </span>
                <span class="text-[9px] font-bold text-[#AFE1AF]">${Math.floor(p.pct * 100)}%</span>
            </div>
            <div class="h-1 mt-1 rounded-full bg-[#2A2A2A] overflow-hidden">
                <div class="h-full rounded-full ${done ? 'bg-[#AFE1AF]' : 'bg-[#D4A72C]'}" style="width:${p.pct * 100}%"></div>
            </div>
            <p class="mt-1 text-[9px] font-bold text-white truncate">${fmt(p.value)}<span class="font-normal text-[#6B7280]">/${fmt(p.target)}</span></p>
        </div>`;
};

const renderCandidate = ({ member: m, parts, score, joined }, i) => `
    <div class="px-3 py-2.5 ${i > 0 ? 'border-t border-[#2A2A2A]' : ''}">
        <div class="flex items-center gap-3">
            <span class="w-3 text-[10px] font-mono text-[#6B7280]">${i + 1}</span>
            <img src="${getTHImage(m.townHallLevel)}" class="w-9 h-9 shrink-0 object-contain"
                 alt="TH${m.townHallLevel}" onerror="this.style.visibility='hidden'">
            <div class="min-w-0 flex-1 leading-tight">
                <p class="text-[13px] font-bold text-white truncate">
                    ${escapeHtml(m.name)}
                    ${joined ? `<span class="ml-1 text-[8px] font-normal tracking-wide text-[#6B7280]">${joined}</span>` : ''}
                </p>
                <p class="text-[9px] font-semibold tracking-wide uppercase text-[#D4A72C]">
                    ${roleName(m.role)} → ${roleName(NEXT_ROLE[m.role])}
                </p>
            </div>
            <div class="shrink-0 text-right leading-tight">
                <p class="text-[15px] font-bold ${score >= PASS_SCORE - 0.001 ? 'text-green-500' : 'text-[#D4A72C]'}">${Math.floor(score)}%</p>
                <p class="text-[7px] tracking-wide uppercase text-[#6B7280]">Score</p>
            </div>
        </div>
        <div class="grid ${parts.length > 3 ? 'grid-cols-4 gap-2' : 'grid-cols-3 gap-3'} mt-2.5">${parts.map((p) => renderPart(p, parts.length > 3)).join('')}</div>
    </div>`;

// "Promotion" card for the About page: the members closest to every target
export function renderPromotionCard() {
    const { cats, rows } = scoreMembers();
    if (!cats.length) return '';

    const top = rows.slice(0, TOP_COUNT); // already sorted by score, highest first
    const skipped = CATEGORIES.filter((c) => !cats.some((x) => x.id === c.id)).map((c) => c.label);

    return `
        <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3">
            <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide mb-2">Promotion</h4>
            ${top.length
                ? `<div class="rounded-xl overflow-hidden border border-[#2A2A2A]">${top.map(renderCandidate).join('')}</div>`
                : '<p class="text-xs text-[#8B8F98] text-center py-3">Tidak ada kandidat.</p>'}
            <p class="text-[8px] text-[#6B7280] mt-1.5">Season sejak ${dayLabel(seasonDate())}${skipped.length ? ` · Belum dihitung (tidak ada data): ${skipped.join(', ')}` : ''}</p>
        </div>`;
}
