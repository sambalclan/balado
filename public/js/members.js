import {
    roleMap, roleWeight, roleName, getTHImage, escapeHtml, fmt,
    pageShell, renderMenuTabs, setMenuActive,
} from './constants.js';

const byRank = (a, b) => (a.clanRank || 0) - (b.clanRank || 0);
const desc = (key) => (a, b) => (b[key] || 0) - (a[key] || 0);

export const MEMBER_SORTS = {
    rank: byRank,
    trophies: desc('trophies'),
    donations: desc('donations'),
    received: desc('donationsReceived'),
    role: (a, b) => (roleWeight[b.role] || 0) - (roleWeight[a.role] || 0) || byRank(a, b),
    th: (a, b) => (b.townHallLevel || 0) - (a.townHallLevel || 0) || desc('trophies')(a, b),
    name: (a, b) => String(a.name).localeCompare(String(b.name)),
};

const SORT_LABELS = {
    rank: 'Rank', trophies: 'Trophies', donations: 'Donated', received: 'Received',
    role: 'Role', th: 'Town Hall', name: 'Name',
};

const ROLE_COLOR = {
    leader:   { bar: 'bg-accent',     chip: 'text-accent bg-accent-soft border-accent-soft' },
    coLeader: { bar: 'bg-role-coleader', chip: 'chip-coleader' },
    admin:    { bar: 'bg-role-admin',    chip: 'chip-admin' },
    member:   { bar: 'bg-tint-3',   chip: 'text-muted bg-tint border-line' },
};

const MAX_MEMBERS = 50;

let sortKey = 'rank';
let search = '';
let roleFilter = 'all';

const tile = (label, value, color) => `
    <div class="rounded-lg border border-line bg-surface px-2 py-1.5 text-center leading-tight">
        <p class="text-[13px] font-bold ${color}">${fmt(value)}</p>
        <p class="text-[7px] tracking-wide uppercase text-subtle mt-0.5">${label}</p>
    </div>`;

const renderMemberRow = (m, i) => {
    const role = ROLE_COLOR[m.role] || ROLE_COLOR.member;
    const league = m.leagueTier?.iconUrls?.small || m.league?.iconUrls?.small || '';

    return `
    <div class="relative flex items-center gap-3 pl-4 pr-3 py-2.5 ${i ? 'border-t border-line' : ''}">
        <span class="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r ${role.bar}"></span>
        <span class="w-5 shrink-0 text-center text-[10px] font-mono text-subtle">${m.clanRank ?? i + 1}</span>
        <img src="${getTHImage(m.townHallLevel)}" class="w-9 h-9 shrink-0 object-contain"
             alt="TH${m.townHallLevel}" onerror="this.style.visibility='hidden'">
        <div class="min-w-0 flex-1 leading-tight">
            <div class="flex items-center gap-1.5 min-w-0">
                <p class="text-[13px] font-semibold text-main truncate">${escapeHtml(m.name)}</p>
                <span class="shrink-0 rounded border px-1 py-px text-[8px] font-semibold uppercase tracking-wide ${role.chip}">${roleName(m.role)}</span>
            </div>
            <p class="mt-0.5 text-[10px] truncate">
                <span class="text-subtle">Lv ${m.expLevel ?? '-'}</span>
                <span class="ml-2 text-good">↑ ${fmt(m.donations)}</span>
                <span class="ml-1.5 text-bad">↓ ${fmt(m.donationsReceived)}</span>
            </p>
        </div>
        <div class="shrink-0 w-14 flex flex-col items-center gap-0.5 rounded-lg border border-line bg-tint py-1">
            ${league ? `<img src="${league}" class="w-7 h-7 object-contain" alt="" onerror="this.style.display='none'">` : ''}
            <span class="text-[13px] font-bold leading-none tabular-nums text-accent">${fmt(m.trophies)}</span>
        </div>
    </div>`;
};

const renderMembersList = (clan) => {
    const q = search.trim().toLowerCase();
    const members = [...(clan?.memberList || [])]
        .filter((m) => roleFilter === 'all' || m.role === roleFilter)
        .filter((m) => !q || (m.name || '').toLowerCase().includes(q))
        .sort(MEMBER_SORTS[sortKey] || byRank);

    if (members.length) return members.map(renderMemberRow).join('');
    return `<p class="text-sm text-subtle text-center py-6">${clan ? 'No members found.' : 'Loading members...'}</p>`;
};

const ROLE_FILTERS = [{ id: 'all', label: 'All' }, ...Object.entries(roleMap).map(([id, label]) => ({ id, label }))];

export function renderMembers(clan) {
    const container = document.getElementById('section-members');
    if (!container) return;

    // The options stay visible while the data loads, so the page is never empty
    const list = clan?.memberList || [];
    const count = clan?.members ?? list.length;
    const total = (key) => list.reduce((n, m) => n + (m[key] || 0), 0);
    const avgTrophies = list.length ? Math.round(total('trophies') / list.length) : 0;

    container.innerHTML = pageShell(`
        <div class="flex items-baseline justify-between mb-1.5">
            <h2 class="medieval text-lg font-semibold text-main uppercase">Members</h2>
            <span class="text-[11px] text-muted font-mono">${count} / ${MAX_MEMBERS}</span>
        </div>
        <div class="h-1 mb-3 rounded-full bg-tint-2 overflow-hidden">
            <div class="h-full rounded-full bg-accent" style="width:${Math.min(count / MAX_MEMBERS, 1) * 100}%"></div>
        </div>

        <div class="grid grid-cols-3 gap-1.5 mb-3">
            ${tile('Avg trophies', avgTrophies, 'text-accent')}
            ${tile('Donated', total('donations'), 'text-good')}
            ${tile('Received', total('donationsReceived'), 'text-bad')}
        </div>

        ${renderMenuTabs('data-role', ROLE_FILTERS, roleFilter)}

        <div class="flex gap-2 mb-3">
            <input id="memberSearch" type="search" value="${escapeHtml(search)}" placeholder="Search name..." autocomplete="off"
                   class="select-text flex-1 min-w-0 px-4 py-1.5 rounded-xl bg-surface border border-line text-xs text-main placeholder-subtle outline-none focus-border-accent">
            <select id="memberSort" class="w-28 px-2 py-1.5 rounded-xl bg-surface border border-line text-xs text-main outline-none">
                ${Object.entries(SORT_LABELS).map(([id, label]) =>
                    `<option value="${id}" ${id === sortKey ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
        </div>

        <div id="membersList" class="rounded-xl overflow-hidden border border-line bg-surface">${renderMembersList(clan)}</div>
    `);

    const refreshList = () => {
        const el = container.querySelector('#membersList');
        if (el) el.innerHTML = renderMembersList(clan);
    };

    container.onclick = (e) => {
        const role = e.target.closest('[data-role]');
        if (!role || !container.contains(role)) return;
        roleFilter = role.dataset.role;
        setMenuActive(role.closest('.menu-tabs'), 'data-role', roleFilter);
        refreshList();
    };

    container.onchange = (e) => {
        if (e.target.id !== 'memberSort') return;
        sortKey = e.target.value;
        refreshList();
    };

    container.oninput = (e) => {
        if (e.target.id !== 'memberSearch') return;
        search = e.target.value;
        refreshList();
    };
}
