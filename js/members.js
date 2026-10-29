import { state, getRaidWeeks } from './state.js';
import {
    roleMap, roleWeight, roleName, getTHImage, escapeHtml, warDate, fmt, dayLabel,
    isEndedWar, warStars, pageShell, pageCard, renderPillTabs, setPillActive,
} from './constants.js';

// ═══ Members · Config ══════════════════════════════════════════════════
export const MEMBER_SORTS = {
    rank: (a, b) => (a.clanRank || 0) - (b.clanRank || 0),
    trophies: (a, b) => (b.trophies || 0) - (a.trophies || 0),
    donations: (a, b) => (b.donations || 0) - (a.donations || 0),
    role: (a, b) => (roleWeight[b.role] || 0) - (roleWeight[a.role] || 0) || (a.clanRank || 0) - (b.clanRank || 0),
    name: (a, b) => String(a.name).localeCompare(String(b.name)),
};

const MEMBER_ROLE_FILTERS = [
    { id: 'all', label: 'All' },
    ...Object.entries(roleMap).map(([id, label]) => ({ id, label })),
];

const MEMBER_SORT_OPTIONS = [
    { id: 'rank', label: 'Rank' },
    { id: 'trophies', label: 'Trophies' },
    { id: 'donations', label: 'Donations' },
    { id: 'role', label: 'Role' },
    { id: 'name', label: 'Name' },
];

const MEMBER_VIEWS = [
    { id: 'list', label: 'Anggota' },
    { id: 'promotion', label: 'Promosi' },
    { id: 'watchlist', label: 'Watchlist' },
];

let membersSortKey = 'rank';
let membersSearch = '';
let membersRole = 'all';
let membersView = 'list';

const TOP_COUNT = 5;
const rowBorder = (i) => (i > 0 ? 'border-t border-[#2A2A2A]' : '');

// ═══ MembersList ════════════════════════════════════════════════════
const renderMemberRow = (m, index) => {
    const league = m.leagueTier?.iconUrls?.small || m.league?.iconUrls?.small || '';

    return `
    <div class="flex items-center gap-3 px-3 py-1.5 ${rowBorder(index)}">
        <img loading="lazy" decoding="async" src="${getTHImage(m.townHallLevel)}" class="w-9 h-9 shrink-0 object-contain"
             alt="TH${m.townHallLevel}" onerror="this.style.visibility='hidden'">
        <div class="min-w-0 flex-1 leading-tight">
            <p class="text-[11px] font-bold text-white truncate">
                ${escapeHtml(m.name)}
                <span class="ml-1 text-[8px] font-mono font-normal tracking-wide text-[#6B7280]">XP ${m.expLevel ?? '-'}</span>
            </p>
            <div class="mt-0.5 flex gap-5 text-[8px] tracking-wide uppercase text-[#8B8F98]">
                <span>Donated <b class="block text-[10px] text-green-500">${m.donations}</b></span>
                <span>Received <b class="block text-[10px] text-red-400">${m.donationsReceived}</b></span>
            </div>
        </div>
        <div class="shrink-0 w-14 flex flex-col items-center leading-tight">
            ${league ? `<img loading="lazy" decoding="async" src="${league}" class="w-5 h-5 object-contain" alt="" onerror="this.style.display='none'">` : ''}
            <span class="text-[10px] font-bold text-[#D4A72C]">${m.trophies}</span>
            <span class="text-[7px] tracking-wide uppercase text-[#6B7280]">Trophies</span>
        </div>
    </div>`;
};

const renderMembersList = (clan) => {
    const sorter = MEMBER_SORTS[membersSortKey] || MEMBER_SORTS.rank;
    const q = membersSearch.trim().toLowerCase();

    const members = [...(clan.memberList || [])]
        .filter((m) => membersRole === 'all' || m.role === membersRole)
        .filter((m) => !q || (m.name || '').toLowerCase().includes(q))
        .sort(sorter);

    return members.length
        ? members.map(renderMemberRow).join('')
        : '<p class="text-sm text-gray-500 text-center py-6">No members found.</p>';
};

function renderListBody(clan) {
    const sortOptions = MEMBER_SORT_OPTIONS
        .map(({ id, label }) => `<option value="${id}" ${id === membersSortKey ? 'selected' : ''}>${label}</option>`)
        .join('');

    return `
        ${renderPillTabs('data-role', MEMBER_ROLE_FILTERS, membersRole)}

        <div class="flex gap-2 mb-2">
            <select id="memberSort"
                    class="flex-1 px-3 py-1.5 rounded-xl bg-[#1E1E1E] border border-[#3A3A3A] text-xs text-white outline-none">
                ${sortOptions}
            </select>
            <button id="memberReset" type="button"
                    class="px-4 py-1.5 rounded-xl border border-[#3A3A3A] text-[10px] font-semibold tracking-wide uppercase text-[#8B8F98] active:scale-95">
                Reset
            </button>
        </div>

        <input id="memberSearch" type="search" value="${escapeHtml(membersSearch)}"
               placeholder="Search name..." autocomplete="off"
               class="select-text w-full mb-3 px-4 py-1.5 rounded-xl bg-[#1E1E1E] border border-[#3A3A3A] text-xs text-white placeholder-gray-500 outline-none focus:border-[#D4A72C]">

        <div id="membersList" class="rounded-xl overflow-hidden border border-[#2A2A2A]">
            ${renderMembersList(clan)}
        </div>
    `;
}

// ═══ Members · Page ════════════════════════════════════════════════════
const emptyNote = '<p class="text-xs text-[#8B8F98] text-center py-3">Data belum tersedia.</p>';

const renderActiveBody = (clan) => {
    if (membersView === 'list') return renderListBody(clan);
    if (membersView === 'promotion') return renderPromotionCard() || emptyNote;
    return renderWatchlistCard() || emptyNote;
};

// Re-render the body of the active sub-tab (direction slides it in from the side)
function updateMembersBody(container, clan, direction = 0) {
    const body = container.querySelector('#membersBody');
    if (!body) return;

    body.innerHTML = renderActiveBody(clan);
    body.classList.remove('view-slide');
    body.style.setProperty('--dx', `${direction * 14}px`);

    if (direction) {
        void body.offsetWidth;
        body.classList.add('view-slide');
    }
}

let searchTimer = null;

export function renderMembers(clan) {
    const container = document.getElementById('section-members');
    if (!container || !clan) return;

    const refreshList = () => {
        const list = container.querySelector('#membersList');
        if (list) list.innerHTML = renderMembersList(clan);
    };

    container.innerHTML = pageShell(pageCard(`
        <div class="flex items-baseline gap-3 mb-3">
            <h2 class="medieval text-lg font-bold text-white uppercase">Members</h2>
            <span class="text-[11px] text-[#8B8F98] font-mono">${clan.members ?? clan.memberList?.length ?? 0} / 50</span>
        </div>

        ${renderPillTabs('data-view', MEMBER_VIEWS, membersView)}

        <div id="membersBody">${renderActiveBody(clan)}</div>
    `));

    container.onclick = (e) => {
        // Sub-tab switch
        const view = e.target.closest('[data-view]');
        if (view && container.contains(view)) {
            const nextIndex = MEMBER_VIEWS.findIndex((v) => v.id === view.dataset.view);
            const previousIndex = MEMBER_VIEWS.findIndex((v) => v.id === membersView);
            if (nextIndex < 0 || nextIndex === previousIndex) return;

            membersView = MEMBER_VIEWS[nextIndex].id;

            // Slide the pill
            setPillActive(view.closest('.pill-tabs'), 'data-view', membersView);

            // Animate content without recreating the navigation
            updateMembersBody(container, clan, Math.sign(nextIndex - previousIndex));
            return;
        }

        // Role filter
        const roleButton = e.target.closest('[data-role]');
        if (roleButton && container.contains(roleButton)) {
            membersRole = roleButton.dataset.role;
            setPillActive(roleButton.closest('.pill-tabs'), 'data-role', membersRole);
            refreshList();
            return;
        }

        // Reset
        if (e.target.closest('#memberReset')) {
            membersSortKey = 'rank';
            membersRole = 'all';
            membersSearch = '';
            updateMembersBody(container, clan);
        }
    };

    container.onchange = (e) => {
        if (e.target.id !== 'memberSort') return;
        membersSortKey = e.target.value;
        refreshList();
    };

    container.oninput = (e) => {
        if (e.target.id !== 'memberSearch') return;
        membersSearch = e.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(refreshList, 150);
    };
}

// ═══ Season utilities ══════════════════════════════════════════════════
// A season starts on the 1st at 08:00 UTC (15:00 WIB)
const seasonDate = (now = new Date()) => {
    const y = now.getUTCFullYear(), m = now.getUTCMonth();
    const thisMonth = new Date(Date.UTC(y, m, 1, 8));
    return (now >= thisMonth ? thisMonth : new Date(Date.UTC(y, m - 1, 1, 8))).toISOString().slice(0, 10);
};

const inSeason = (record) => warDate(record) >= seasonDate();
const endedWars = () => state.wars.filter((w) => isEndedWar(w) && inSeason(w));
const raidWeeks = () => getRaidWeeks().filter(inSeason);

// ═══ Promotion ═════════════════════════════════════════════════════════
const PASS_SCORE = 100;
const NEXT_ROLE = { member: 'admin', admin: 'coLeader' };

// Sum a value per member tag over many records (wars, raid weekends)
const sumByTag = (records, getMembers, getValue) => {
    const totals = new Map();
    records.forEach((rec) => getMembers(rec).forEach((m) => {
        totals.set(m.tag, (totals.get(m.tag) || 0) + getValue(m));
    }));
    return totals;
};

const donationValues = () => new Map((state.clan?.memberList || []).map((m) => [m.tag, m.donations || 0]));

const warValues = () => {
    const wars = endedWars();
    return wars.length ? sumByTag(wars, (w) => w.clan?.members || [], warStars) : null;
};

const raidValues = () => {
    const weeks = raidWeeks();
    return weeks.length ? sumByTag(weeks, (w) => w.members || [], (m) => m.capitalResourcesLooted || 0) : null;
};

const cwlValues = () => {
    const cwl = state.cwl;
    if (!cwl || cwl.season !== seasonDate().slice(0, 7)) return null;
    return new Map((cwl.members || []).map((m) => [m.tag, m.stars || 0]));
};

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

    const wars = endedWars();
    const hasWar = cats.some((c) => c.id === 'war');

    const rows = (state.clan?.memberList || [])
        .filter((m) => NEXT_ROLE[m.role])
        .map((m) => {
            const parts = cats.map((c) => {
                const value = c.map.get(m.tag) || 0;
                return { icon: c.icon, value, target: c.target, pct: Math.min(value / c.target, 1) };
            });
            const score = parts.reduce((n, p, i) => n + p.pct * cats[i].weight, 0) / totalWeight * 100;
            const joined = hasWar
                ? `Ikut ${wars.filter((w) => (w.clan?.members || []).some((x) => x.tag === m.tag)).length}/${wars.length} war`
                : '';
            return { member: m, parts, score, joined };
        })
        .sort((a, b) => b.score - a.score);

    return { cats, rows };
}

const renderPart = (p) => `
    <div class="min-w-0">
        <div class="flex items-center justify-between gap-1">
            <span class="material-symbols-outlined text-[12px] text-[#8B8F98]">${p.icon}</span>
            <span class="text-[8px] font-bold text-[#AFE1AF]">${Math.floor(p.pct * 100)}%</span>
        </div>
        <div class="h-1 mt-1 rounded-full bg-[#2A2A2A] overflow-hidden">
            <div class="h-full rounded-full ${p.pct >= 1 ? 'bg-[#AFE1AF]' : 'bg-[#D4A72C]'}" style="width:${p.pct * 100}%"></div>
        </div>
        <p class="mt-1 text-[8px] font-bold text-white truncate">
            ${fmt(p.value)}
            <span class="font-normal text-[#6B7280]">/${fmt(p.target)}</span>
        </p>
    </div>`;

const renderCandidate = ({ member: m, parts, score, joined }, i) => `
    <div class="px-3 py-2.5 ${rowBorder(i)}">
        <div class="flex items-center gap-3">
            <span class="w-3 text-[10px] font-mono text-[#6B7280]">${i + 1}</span>
            <img loading="lazy" decoding="async" src="${getTHImage(m.townHallLevel)}" class="w-9 h-9 shrink-0 object-contain"
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
        <div class="grid ${parts.length > 3 ? 'grid-cols-4 gap-2' : 'grid-cols-3 gap-3'} mt-2.5">
            ${parts.map(renderPart).join('')}
        </div>
    </div>`;

function renderPromotionCard() {
    const { cats, rows } = scoreMembers();
    if (!cats.length) return '';

    const top = rows.slice(0, TOP_COUNT);
    const skipped = CATEGORIES.filter((c) => !cats.some((x) => x.id === c.id)).map((c) => c.label);

    return pageCard(`
        ${top.length
            ? `<div class="rounded-xl overflow-hidden border border-[#2A2A2A]">${top.map(renderCandidate).join('')}</div>`
            : '<p class="text-xs text-[#8B8F98] text-center py-3">Tidak ada kandidat.</p>'}
        <p class="text-[8px] text-[#6B7280] mt-1.5">
            Season sejak ${dayLabel(seasonDate())}
            ${skipped.length ? ` · Belum dihitung (tidak ada data): ${skipped.join(', ')}` : ''}
        </p>
    `);
}

// ═══ Watchlist ═════════════════════════════════════════════════════════
const LOW_DONATION = 200;
const SKIP_ROLES = ['leader', 'coLeader'];

function scoreWatchlist() {
    const wars = endedWars();
    const raids = raidWeeks();

    const rows = (state.clan?.memberList || [])
        .filter((m) => !SKIP_ROLES.includes(m.role))
        .map((m) => {
            let missedWar = 0;
            wars.forEach((w) => {
                const me = (w.clan?.members || []).find((x) => x.tag === m.tag);
                if (me) missedWar += Math.max((w.attacksPerMember || 2) - (me.attacks?.length || 0), 0);
            });

            const skippedRaid = raids.filter((r) => !((r.members || []).find((x) => x.tag === m.tag)?.attacks > 0)).length;
            const lowDonation = (m.donations || 0) < LOW_DONATION;
            const score = missedWar * 2 + skippedRaid * 3 + (lowDonation ? 1 : 0);

            const reasons = [];
            if (wars.length && missedWar) reasons.push(`${missedWar} war terlewat`);
            if (raids.length && skippedRaid) reasons.push(`${skippedRaid}/${raids.length} raid skip`);
            if (lowDonation) reasons.push(`Donasi ${m.donations || 0}`);

            return { member: m, score, reasons };
        })
        .filter((r) => r.score > 1)
        .sort((a, b) => b.score - a.score);

    return { rows, wars: wars.length, raids: raids.length };
}

const renderWatchlistRow = ({ member: m, reasons }, i) => `
    <div class="flex items-center gap-3 px-3.5 py-3 ${rowBorder(i)}">
        <img loading="lazy" decoding="async" src="${getTHImage(m.townHallLevel)}" class="w-9 h-9 shrink-0 object-contain"
             alt="TH${m.townHallLevel}" onerror="this.style.visibility='hidden'">
        <div class="min-w-0 flex-1 flex flex-col gap-0.5">
            <p class="text-[13px] font-bold leading-tight text-white truncate">${escapeHtml(m.name)}</p>
            <p class="text-[9px] leading-tight text-red-400 truncate">${reasons.join(' · ')}</p>
        </div>
    </div>`;

function renderWatchlistCard() {
    const { rows, wars, raids } = scoreWatchlist();
    if (!wars && !raids) return '';

    const top = rows.slice(0, TOP_COUNT);

    return top.length
        ? `<div class="rounded-xl overflow-hidden border border-[#2A2A2A]">${top.map(renderWatchlistRow).join('')}</div>`
        : '<p class="text-xs text-[#8B8F98] text-center py-3">Semua anggota aktif musim ini.</p>';
}
