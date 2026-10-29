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
    th: (a, b) => (b.townHallLevel || 0) - (a.townHallLevel || 0) || (b.trophies || 0) - (a.trophies || 0),
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
    { id: 'th', label: 'Town Hall' },
    { id: 'active', label: 'Paling lama tidak aktif' },
    { id: 'name', label: 'Name' },
];

const MEMBER_VIEWS = [
    { id: 'list', label: 'Roster' },
    { id: 'war', label: 'War' },
    { id: 'promotion', label: 'Promosi' },
    { id: 'inactive', label: 'Jarang On' },
];

let membersSortKey = 'rank';
let membersSearch = '';
let membersRole = 'all';
let membersView = 'list';
let memberWarIndex = 0;
let memberWarSearch = '';

const TOP_COUNT = 5;
const rowBorder = (i) => (i > 0 ? 'border-t border-[#2A2A2A]' : '');

// ═══ MembersList ════════════════════════════════════════════════════
const ROLE_STYLE = {
    leader:   { bar: 'bg-[#D4A72C]',  chip: 'text-[#D4A72C] bg-[#2A2410] border-[#6B5A1E]' },
    coLeader: { bar: 'bg-orange-400', chip: 'text-orange-300 bg-[#2A1C10] border-[#6B4A1E]' },
    admin:    { bar: 'bg-sky-400',    chip: 'text-sky-300 bg-[#10202A] border-[#1E4A6B]' },
    member:   { bar: 'bg-[#3A3A3A]',  chip: 'text-[#8B8F98] bg-[#252525] border-[#3A3A3A]' },
};

const renderMemberRow = (m, index, act) => {
    const badge = activityBadge(act?.get(m.tag));
    const league = m.leagueTier?.iconUrls?.small || m.league?.iconUrls?.small || '';
    const role = ROLE_STYLE[m.role] || ROLE_STYLE.member;
    const given = m.donations || 0, got = m.donationsReceived || 0;
    const givenPct = given + got ? Math.round((given / (given + got)) * 100) : 50;

    return `
    <div data-member="${m.tag}" class="${rowBorder(index)}">
    <div class="relative flex items-center gap-3 pl-4 pr-3 py-2 cursor-pointer active:bg-white/5 transition-colors">
        <span class="absolute left-0 top-2 bottom-2 w-[3px] rounded-r ${role.bar}"></span>
        <div class="relative shrink-0">
            <img src="${getTHImage(m.townHallLevel)}" class="w-10 h-10 object-contain"
                 alt="TH${m.townHallLevel}" onerror="this.style.visibility='hidden'">
            ${badge ? `<span class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1E1E1E] ${badge.dot}"></span>` : ''}
            <span class="absolute -bottom-1 -right-1 min-w-[16px] px-1 rounded-full bg-[#141414] border border-[#3A3A3A] text-[8px] font-bold text-[#8B8F98] text-center leading-[14px]">${m.clanRank ?? index + 1}</span>
        </div>
        <div class="min-w-0 flex-1 leading-tight">
            <div class="flex items-center gap-1.5 min-w-0">
                <p class="text-[12px] font-bold text-white truncate">${escapeHtml(m.name)}</p>
                <span class="shrink-0 px-1.5 py-px rounded-full border text-[7px] font-bold uppercase tracking-wide ${role.chip}">${roleName(m.role)}</span>
            </div>
            <div class="mt-1.5 flex h-1 rounded-full overflow-hidden bg-[#2A2A2A]">
                <div class="bg-green-500" style="width:${givenPct}%"></div>
                <div class="bg-red-400/80" style="width:${100 - givenPct}%"></div>
            </div>
            <div class="mt-1 flex items-center justify-between text-[8px] tracking-wide uppercase text-[#8B8F98]">
                <span>Donated <b class="text-[10px] text-green-500">${given}</b></span>
                <span class="normal-case text-[8px] ${badge ? badge.text : 'text-[#6B7280] font-mono'}">${badge ? badge.label : `XP ${m.expLevel ?? '-'}`}</span>
                <span>Received <b class="text-[10px] text-red-400">${got}</b></span>
            </div>
        </div>
        <div class="shrink-0 w-14 flex flex-col items-center leading-tight rounded-lg bg-[#252525] border border-[#2F2F2F] py-1">
            ${league ? `<img src="${league}" class="w-5 h-5 object-contain" alt="" onerror="this.style.display='none'">` : ''}
            <span class="text-[11px] font-bold text-[#D4A72C]">${m.trophies}</span>
            <span class="text-[7px] tracking-wide uppercase text-[#6B7280]">Trophies</span>
        </div>
    </div>
    <div class="member-detail hidden"></div>
    </div>`;
};

const renderMemberSummary = (clan) => {
    const list = clan.memberList || [];
    const total = (key) => list.reduce((n, m) => n + (m[key] || 0), 0);
    const avgTrophies = list.length ? Math.round(total('trophies') / list.length) : 0;
    const tile = (label, value, color) => `
        <div class="rounded-lg bg-[#141414] border border-[#2A2A2A] px-2 py-1.5 text-center leading-tight">
            <p class="text-[13px] font-bold ${color}">${value}</p>
            <p class="text-[7px] tracking-wide uppercase text-[#6B7280] mt-0.5">${label}</p>
        </div>`;
    return `<div class="grid grid-cols-3 gap-1.5 mb-3">
        ${tile('Donated', fmt(total('donations')), 'text-green-500')}
        ${tile('Received', fmt(total('donationsReceived')), 'text-red-400')}
        ${tile('Avg trophies', fmt(avgTrophies), 'text-[#D4A72C]')}
    </div>`;
};

const renderMembersList = (clan) => {
    const act = memberActivity();
    const idleSince = (m) => { const i = act.get(m.tag); return i ? (i.ms || i.since) : Infinity; };
    const sorter = membersSortKey === 'active'
        ? (a, b) => (idleSince(a) === idleSince(b) ? 0 : idleSince(a) < idleSince(b) ? -1 : 1)
        : (MEMBER_SORTS[membersSortKey] || MEMBER_SORTS.rank);
    const q = membersSearch.trim().toLowerCase();

    const members = [...(clan.memberList || [])]
        .filter((m) => membersRole === 'all' || m.role === membersRole)
        .filter((m) => !q || (m.name || '').toLowerCase().includes(q))
        .sort(sorter);

    return members.length
        ? members.map((m, i) => renderMemberRow(m, i, act)).join('')
        : '<p class="text-sm text-gray-500 text-center py-6">No members found.</p>';
};

function renderListBody(clan) {
    const sortOptions = MEMBER_SORT_OPTIONS
        .map(({ id, label }) => `<option value="${id}" ${id === membersSortKey ? 'selected' : ''}>${label}</option>`)
        .join('');

    return `
        ${renderMemberSummary(clan)}

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

// ═══ War performance inside Members ════════════════════════════════════
function renderMemberWarBody() {
    const wars = state.wars || [];
    if (!wars.length) return '<p class="text-xs text-[#8B8F98] text-center py-6">Data War belum tersedia.</p>';

    memberWarIndex = Math.max(0, Math.min(memberWarIndex, wars.length - 1));
    const war = wars[memberWarIndex];
    const members = war.clan?.members || [];
    const maxAttacks = war.attacksPerMember || 2;
    const query = memberWarSearch.trim().toLowerCase();
    const options = wars.map((w, i) => `<option value="${i}" ${i === memberWarIndex ? 'selected' : ''}>${escapeHtml(warDate(w) || 'War')} · ${escapeHtml(w.opponent?.name || 'Opponent')}</option>`).join('');

    const rows = members.filter(m => !query || (m.name || '').toLowerCase().includes(query))
        .sort((a, b) => (a.mapPosition || 0) - (b.mapPosition || 0))
        .map((m, i) => {
            const attacks = m.attacks || [];
            const th = m.townhallLevel ?? m.townHallLevel;
            const attackInfo = attacks.map(a => `<span class="text-[10px] text-[#BEC7D4] whitespace-nowrap"><span class="text-[#D4A72C]">${'★'.repeat(Math.max(0, Math.min(3, a.stars || 0))) || '☆'}</span> ${Number(a.destructionPercentage || 0).toFixed(1)}%</span>`).join('<span class="text-[#555]">·</span>');
            return `<div class="flex items-center gap-3 px-3 py-3 ${rowBorder(i)}">
                <img src="${getTHImage(th)}" class="w-10 h-10 shrink-0 object-contain" alt="TH${th || '-'}" onerror="this.style.visibility='hidden'">
                <div class="min-w-0 flex-1">
                    <p class="text-[12px] font-semibold text-white truncate">${escapeHtml(m.name || '')}</p>
                    <p class="text-[9px] text-[#8B8F98] mt-0.5">TH${th || '-'} · ${attacks.length}/${maxAttacks} serangan</p>
                    <div class="flex flex-wrap gap-2 mt-1.5">${attackInfo || '<span class="text-[10px] text-[#777]">Belum menyerang</span>'}</div>
                </div>
                <span class="text-[13px] font-bold text-[#D4A72C] shrink-0">${warStars(m)}★</span>
            </div>`;
        }).join('');

    return `<div class="rounded-xl bg-[#1E1E1E] px-3 py-3 mb-3">
        <p class="text-[9px] text-[#8B8F98] mb-1">WAR PERFORMANCE</p>
        <div class="flex items-center justify-between gap-3">
            <p class="text-[12px] font-semibold text-white truncate">${escapeHtml(war.clan?.name || 'Clan')} <span class="text-[#777]">vs</span> ${escapeHtml(war.opponent?.name || 'Opponent')}</p>
            <span class="text-[14px] font-bold text-white shrink-0">${war.clan?.stars || 0} - ${war.opponent?.stars || 0}</span>
        </div>
    </div>
    <select id="memberWarSelect" class="w-full mb-2 px-3 py-2 rounded-xl bg-[#1E1E1E] text-xs text-white outline-none">${options}</select>
    <input id="memberWarSearch" type="search" value="${escapeHtml(memberWarSearch)}" autocomplete="off" placeholder="Cari anggota..." class="select-text w-full mb-3 px-3 py-2 rounded-xl bg-[#1E1E1E] text-xs text-white placeholder-gray-500 outline-none">
    <div id="memberWarList" class="rounded-xl overflow-hidden bg-[#1E1E1E]">${rows || '<p class="text-xs text-[#8B8F98] text-center py-6">Anggota tidak ditemukan.</p>'}</div>`;
}

// ═══ Members · Page ════════════════════════════════════════════════════
const emptyNote = '<p class="text-xs text-[#8B8F98] text-center py-3">Data belum tersedia.</p>';

const renderActiveBody = (clan) => {
    if (membersView === 'list') return renderListBody(clan);
    if (membersView === 'war') return renderMemberWarBody();
    if (membersView === 'promotion') return renderPromotionCard() || emptyNote;
    return renderInactiveCard() || emptyNote;
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
        // Tap a member to show or hide the details
        const memberRow = e.target.closest('[data-member]');
        if (memberRow && container.contains(memberRow)) {
            const box = memberRow.querySelector('.member-detail');
            if (box.innerHTML && !box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
            box.innerHTML = memberDetailHtml(memberRow.dataset.member);
            box.classList.remove('hidden');
            return;
        }

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
        if (e.target.id === 'memberWarSelect') {
            memberWarIndex = Number(e.target.value) || 0;
            updateMembersBody(container, clan);
            return;
        }
        if (e.target.id !== 'memberSort') return;
        membersSortKey = e.target.value;
        refreshList();
    };

    container.oninput = (e) => {
        if (e.target.id === 'memberWarSearch') {
            memberWarSearch = e.target.value;
            const list = container.querySelector('#memberWarList');
            if (list) {
                const temp = document.createElement('div');
                temp.innerHTML = renderMemberWarBody();
                list.innerHTML = temp.querySelector('#memberWarList')?.innerHTML || '';
            }
            return;
        }
        if (e.target.id !== 'memberSearch') return;
        membersSearch = e.target.value;
        refreshList();
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

// ═══ Jarang On (members who are rarely online) ════════════════════════
// The Worker checks the clan every few minutes and stores in D1 when each member last showed
// activity (donations given, trophies, XP). War and raid attacks count as activity too.
const INACTIVE_DAYS = 3;
const MAX_INACTIVE = 15;
const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;

const formatIdle = (ms) => (ms >= DAY_MS ? `${Math.floor(ms / DAY_MS)} hari` : `${Math.floor(ms / HOUR_MS)} jam`);

// War and raid attacks per member (date only, so noon is used as the time)
function attackTimes() {
    const attackedAt = new Map();
    const markAttack = (tag, date) => {
        const t = Date.parse(date + 'T12:00:00Z');
        if (t && t > (attackedAt.get(tag) || 0)) attackedAt.set(tag, t);
    };
    state.wars.filter(isEndedWar).forEach((w) => (w.clan?.members || []).forEach((m) => {
        if ((m.attacks || []).length) markAttack(m.tag, warDate(w));
    }));
    getRaidWeeks().forEach((w) => (w.members || []).forEach((m) => {
        if (m.attacks > 0) markAttack(m.tag, warDate(w));
    }));
    return attackedAt;
}

// tag -> { ms: last sign of activity (0 = none yet), since: when tracking started }
function memberActivity() {
    const map = new Map();
    const data = state.activity;
    if (!data?.members) return map;
    const attackedAt = attackTimes();
    data.members.forEach((r) => {
        map.set(r.tag, {
            ms: Math.max(Date.parse(r.lastActive) || 0, attackedAt.get(r.tag) || 0),
            since: Date.parse(r.firstSeen) || Date.now(),
        });
    });
    return map;
}

// Colour and text for the activity status shown on a member
function activityBadge(info) {
    if (!info) return null;
    const idle = Date.now() - (info.ms || info.since);
    if (!info.ms) {
        return idle < INACTIVE_DAYS * DAY_MS
            ? { dot: 'bg-[#6B7280]', text: 'text-[#6B7280]', label: 'Baru dipantau' }
            : { dot: 'bg-red-500', text: 'text-red-400', label: `Diam ≥ ${formatIdle(idle)}` };
    }
    const label = idle < HOUR_MS ? 'Aktif barusan' : `Aktif ${formatIdle(idle)} lalu`;
    if (idle < DAY_MS) return { dot: 'bg-green-500', text: 'text-green-500', label };
    if (idle < INACTIVE_DAYS * DAY_MS) return { dot: 'bg-[#D4A72C]', text: 'text-[#D4A72C]', label };
    return { dot: 'bg-red-500', text: 'text-red-400', label };
}

// This season's war and raid numbers for one member
function memberSeasonStats(tag) {
    let stars = 0, used = 0, possible = 0, gold = 0;
    endedWars().forEach((w) => {
        const me = (w.clan?.members || []).find((x) => x.tag === tag);
        if (!me) return;
        stars += warStars(me);
        used += (me.attacks || []).length;
        possible += w.attacksPerMember || 2;
    });
    raidWeeks().forEach((r) => {
        const me = (r.members || []).find((x) => x.tag === tag);
        if (me) gold += me.capitalResourcesLooted || 0;
    });
    return { stars, used, possible, gold };
}

function memberDetailHtml(tag) {
    const m = (state.clan?.memberList || []).find((x) => x.tag === tag);
    if (!m) return '';
    const s = memberSeasonStats(tag);
    const badge = activityBadge(memberActivity().get(tag));
    const given = m.donations || 0, got = m.donationsReceived || 0;
    const ratio = got ? (given / got).toFixed(1) + 'x' : given ? '∞' : '-';
    const missed = s.possible - s.used;

    const tile = (label, value, sub, color = 'text-white') => `
        <div class="rounded-lg bg-[#141414] border border-[#2A2A2A] px-2 py-1.5 text-center leading-tight">
            <p class="text-[12px] font-bold ${color}">${value}</p>
            <p class="text-[7px] tracking-wide uppercase text-[#6B7280] mt-0.5">${label}</p>
            ${sub ? `<p class="text-[8px] mt-0.5 ${missed > 0 && label === 'War' ? 'text-red-400' : 'text-[#8B8F98]'}">${sub}</p>` : ''}
        </div>`;

    return `
    <div class="detail-in grid grid-cols-3 gap-1.5 px-3 pb-2.5 pt-0.5">
        ${tile('War', `${s.stars}★`, s.possible ? `${s.used}/${s.possible} serangan` : 'belum ikut', 'text-[#D4A72C]')}
        ${tile('Raid gold', fmt(s.gold), '', 'text-[#D4A72C]')}
        ${tile('Rasio donasi', ratio, `${given} / ${got}`, ratio === '-' || parseFloat(ratio) >= 1 || ratio === '∞' ? 'text-green-500' : 'text-red-400')}
        ${tile('XP', m.expLevel ?? '-', '')}
        ${tile('Town Hall', `TH${m.townHallLevel}`, '')}
        ${tile('Aktivitas', badge ? badge.label.replace('Aktif ', '') : '-', '', badge ? badge.text : 'text-[#8B8F98]')}
    </div>`;
}

function scoreInactive() {
    const data = state.activity;
    if (!data?.members) return null;

    const now = Date.now();
    const byTag = new Map(data.members.map((m) => [m.tag, m]));

    const attackedAt = attackTimes();

    const rows = (state.clan?.memberList || [])
        .map((member) => {
            const rec = byTag.get(member.tag);
            if (!rec) return null; // not tracked yet (just joined)
            const active = Math.max(Date.parse(rec.lastActive) || 0, attackedAt.get(member.tag) || 0);
            const since = active || Date.parse(rec.firstSeen);
            return { member, idle: now - since, never: !active };
        })
        .filter((r) => r && r.idle >= INACTIVE_DAYS * DAY_MS)
        .sort((a, b) => b.idle - a.idle);

    return { rows, since: data.trackingSince };
}

const renderInactiveRow = ({ member: m, idle, never }, i) => `
    <div class="flex items-center gap-3 px-3.5 py-3 ${rowBorder(i)}">
        <img src="${getTHImage(m.townHallLevel)}" class="w-9 h-9 shrink-0 object-contain"
             alt="TH${m.townHallLevel}" onerror="this.style.visibility='hidden'">
        <div class="min-w-0 flex-1 leading-tight">
            <p class="text-[13px] font-bold text-white truncate">${escapeHtml(m.name)}</p>
            <p class="text-[9px] font-semibold tracking-wide uppercase text-[#D4A72C]">${roleName(m.role)}</p>
        </div>
        <div class="shrink-0 text-right leading-tight">
            <p class="text-[12px] font-bold ${never ? 'text-red-400' : 'text-[#D4A72C]'}">${never ? '≥ ' : ''}${formatIdle(idle)}</p>
            <p class="text-[7px] tracking-wide uppercase text-[#6B7280]">${never ? 'Belum terlihat aktif' : 'Terakhir aktif'}</p>
        </div>
    </div>`;

function renderInactiveCard() {
    const result = scoreInactive();
    if (!result) return '<p class="text-xs text-[#8B8F98] text-center py-3">Data aktivitas belum tersedia dari Worker.</p>';

    const { rows, since } = result;
    if (!state.activity.members.length) {
        return '<p class="text-xs text-[#8B8F98] text-center py-3">Belum ada data aktivitas. Tunggu pengecekan Worker berikutnya (cron) berjalan.</p>';
    }
    const tracked = since ? Date.now() - Date.parse(since) : 0;
    if (!rows.length && tracked < INACTIVE_DAYS * DAY_MS) {
        return `<p class="text-xs text-[#8B8F98] text-center py-3">Baru dipantau ${formatIdle(tracked)}. Daftar muncul setelah ${INACTIVE_DAYS} hari data terkumpul.</p>`;
    }
    const shown = rows.slice(0, MAX_INACTIVE);
    const sinceText = since ? new Date(since).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-';

    return `
        ${shown.length
            ? `<div class="rounded-xl overflow-hidden border border-[#2A2A2A]">${shown.map(renderInactiveRow).join('')}</div>`
            : `<p class="text-xs text-[#8B8F98] text-center py-3">Semua anggota aktif dalam ${INACTIVE_DAYS} hari terakhir.</p>`}
        <p class="text-[8px] text-[#6B7280] mt-1.5">
            ${rows.length > MAX_INACTIVE ? `${MAX_INACTIVE} dari ${rows.length} anggota · ` : ''}Tanpa aktivitas ≥ ${INACTIVE_DAYS} hari ·
            dipantau sejak ${sinceText}. Dari donasi, trophy, XP, war dan raid (bukan status online sebenarnya).
        </p>`;
}
