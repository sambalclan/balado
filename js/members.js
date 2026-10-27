import { roleMap, roleWeight, getTHImage, escapeHtml } from './constants.js';
import { openMemberDetail } from './member-detail.js';
import { state } from './state.js';

// Sort options (also used by the Members report in render.js)
export const MEMBER_SORTS = {
    rank:      (a, b) => (a.clanRank || 0) - (b.clanRank || 0),
    trophies:  (a, b) => (b.trophies || 0) - (a.trophies || 0),
    donations: (a, b) => (b.donations || 0) - (a.donations || 0),
    role:      (a, b) => (roleWeight[b.role] || 0) - (roleWeight[a.role] || 0)
                         || (a.clanRank || 0) - (b.clanRank || 0),
    name:      (a, b) => String(a.name).localeCompare(String(b.name)),
};

// ── 9. Members page ──
const MEMBER_ROLE_FILTERS = [{ id: 'all', label: 'All' }, ...Object.entries(roleMap).map(([id, label]) => ({ id, label }))];

const MEMBER_SORT_OPTIONS = [
    { id: 'rank',      label: 'Rank' },
    { id: 'trophies',  label: 'Trophies' },
    { id: 'donations', label: 'Donations' },
    { id: 'role',      label: 'Role' },
    { id: 'name',      label: 'Name' },
];

let membersSortKey = 'rank';
let membersSearch = '';
let membersRole = 'all';

const renderRoleButton = ({ id, label }) => {
    const style = id === membersRole
        ? 'bg-[#2A2410] border-[#6B5A1E] text-[#D4A72C]'
        : 'border-transparent text-[#6B7280]';
    return `
        <button type="button" data-role="${id}"
                class="py-1.5 rounded-lg border text-[9px] font-semibold tracking-wide uppercase whitespace-nowrap ${style}
                       active:scale-95 transition-all">${label}</button>
    `;
};

const renderMemberRow = (m, index) => {
    const league = m.leagueTier?.iconUrls?.small || m.league?.iconUrls?.small || '';

    return `
    <div data-member="${escapeHtml(m.tag)}" class="flex items-center gap-3 px-3 py-1.5 cursor-pointer ${index > 0 ? 'border-t border-[#2A2A2A]' : ''}">
        <img src="${getTHImage(m.townHallLevel)}" class="w-8 h-8 shrink-0 object-contain"
             alt="TH${m.townHallLevel}" onerror="this.style.visibility='hidden'">
        <div class="min-w-0 flex-1 leading-tight">
            <p class="text-[11px] font-bold text-white truncate">
                ${escapeHtml(m.name)}
                <span class="ml-1 text-[8px] font-mono font-normal tracking-wide text-[#6B7280]">XP ${m.expLevel ?? '-'}</span>
            </p>
            <div class="mt-0.5 flex gap-5 text-[8px] tracking-wide uppercase text-[#8B8F98]">
                <span>Donated <b class="block text-[8px] text-green-500">${m.donations}</b></span>
                <span>Received <b class="block text-[8px] text-red-400">${m.donationsReceived}</b></span>
            </div>
        </div>
        <div class="shrink-0 w-14 flex flex-col items-center leading-tight">
            ${league ? `<img src="${league}" class="w-5 h-5 object-contain" alt="" onerror="this.style.display='none'">` : ''}
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

export function renderMembers(clan) {
    const container = document.getElementById('section-members');
    if (!container || !clan) return;

    const roleButtons = MEMBER_ROLE_FILTERS.map(renderRoleButton).join('');
    const sortOptions = MEMBER_SORT_OPTIONS.map(({ id, label }) =>
        `<option value="${id}" ${id === membersSortKey ? 'selected' : ''}>${label}</option>`
    ).join('');

    container.innerHTML = `
        <div class="px-0 py-3 pb-28 w-full">
            <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3">
                <div class="flex items-baseline gap-3 mb-3">
                    <h2 class="medieval text-lg font-bold text-white uppercase">Members</h2>
                    <span class="text-[11px] text-[#8B8F98] font-mono">${clan.members ?? clan.memberList?.length ?? 0} / 50</span>
                </div>

                <div class="grid grid-cols-5 gap-1 p-1 mb-3 rounded-xl bg-[#141414] border border-[#2A2A2A]">
                    ${roleButtons}
                </div>

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
                       class="select-text w-full mb-3 px-4 py-1.5 rounded-xl bg-[#1E1E1E] border border-[#3A3A3A]
                              text-xs text-white placeholder-gray-500 outline-none focus:border-[#D4A72C]">

                <div id="membersList" class="rounded-xl overflow-hidden border border-[#2A2A2A]">
                    ${renderMembersList(clan)}
                </div>
            </div>
        </div>
    `;

    container.onclick = (e) => {
        const btn = e.target.closest('[data-role]');
        if (btn) { membersRole = btn.dataset.role; renderMembers(clan); return; }

        const row = e.target.closest('[data-member]');
        if (!row) return;
        const member = (clan.memberList || []).find((m) => m.tag === row.dataset.member);
        openMemberDetail(member, { wars: state.wars, raid: state.raid });
    };
    container.querySelector('#memberSort').onchange = (e) => {
        membersSortKey = e.target.value;
        container.querySelector('#membersList').innerHTML = renderMembersList(clan);
    };
    container.querySelector('#memberReset').onclick = () => {
        membersSortKey = 'rank'; membersRole = 'all'; membersSearch = '';
        renderMembers(clan);
    };
    container.querySelector('#memberSearch').addEventListener('input', (e) => {
        membersSearch = e.target.value;
        container.querySelector('#membersList').innerHTML = renderMembersList(clan);
    });
}
