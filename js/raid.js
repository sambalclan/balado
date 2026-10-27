import { roleName, getTHImage, escapeHtml, warDate } from './constants.js';
import { state } from './state.js';
import { fmt } from './chart.js';

// ── Raid tab: one card per raid weekend, click it to see every member ──
let raidSelected = null; // index of the opened weekend, or null for the list

const raidDate = (w) => warDate({ endTime: w.endTime, startTime: w.startTime, __file: w.__file });

// Clans attacked during a raid weekend (from the attack log)
const raidTargets = (w) => (Array.isArray(w.attackLog) ? w.attackLog : []).map((e) => ({
    name: e.defender?.name || 'Unknown clan',
    badge: e.defender?.badgeUrls?.small || '',
    attacks: e.attackCount,
    destroyed: e.districtsDestroyed,
    districts: e.districtCount,
}));

// Page wrappers shared by the empty, list and detail views
const pageShell = (inner) => `<div class="px-0 py-3 pb-28 w-full">${inner}</div>`;
const pageCard = (inner) => `<div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-2xl p-3">${inner}</div>`;

const renderRaidCard = (w, i) => {
    const mine = state.clan || {};
    const attackers = (w.members || []).filter((m) => (m.attacks || 0) > 0).length;
    const targets = raidTargets(w);
    return `
    <div data-raid="${i}" class="bg-[#1E1E1E] border border-[#3A3A3A] rounded-xl px-3 py-2 cursor-pointer active:scale-[0.99] transition-transform">
        <div class="flex items-center justify-between text-[9px] font-mono tracking-wide text-[#8B8F98] mb-1">
            <span>${raidDate(w) || '-'}</span>
            <span class="text-[8px] font-semibold ${attackers < 15 ? 'text-red-500' : 'text-green-500'}">${attackers} attacks</span>
        </div>
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div class="flex items-center gap-2 min-w-0">
                <img src="${mine.badgeUrls?.small || ''}" class="w-8 h-8 shrink-0 object-contain" alt="" onerror="this.style.visibility='hidden'">
                <div class="min-w-0 leading-tight">
                    <p class="text-xs font-bold text-white truncate">${escapeHtml(mine.name || '')}</p>
                    <p class="text-[9px] text-[#6B7280]">${fmt(w.totalAttacks)} Atks</p>
                </div>
            </div>
            <div class="text-center leading-tight">
                <p class="text-[9px] font-semibold tracking-widest text-[#D4A72C]">RAID</p>
                <p class="medieval text-lg font-bold text-[#D4A72C]">${fmt(w.capitalTotalLoot)}</p>
                <p class="text-[8px] text-[#6B7280]">Capital Gold</p>
            </div>
            <div class="min-w-0 leading-tight text-right">
                <p class="text-xs font-bold text-white">${fmt(w.enemyDistrictsDestroyed)} Districts</p>
            </div>
        </div>
        ${targets.length ? `
        <div class="mt-2 pt-2 border-t border-[#2A2A2A] flex flex-wrap gap-1.5">
            ${targets.map((t) => `
            <span class="flex items-center gap-1 bg-[#252525] px-2 py-0.5 rounded-lg max-w-full">
                ${t.badge ? `<img src="${t.badge}" class="w-4 h-4 object-contain" alt="" onerror="this.style.display='none'">` : ''}
                <span class="text-[10px] text-gray-400 truncate">${escapeHtml(t.name)}</span>
            </span>`).join('')}
        </div>` : ''}
    </div>`;
};

const renderRaidMemberRow = (m, i) => {
    // Raid data has no TH/role, so look the member up in the clan list
    const info = (state.clan?.memberList || []).find((c) => c.tag === m.tag) || {};
    const th = info.townHallLevel;
    const limit = (m.attackLimit || 0) + (m.bonusAttackLimit || 0);
    const idle = !(m.attacks > 0);
    return `
    <div class="flex items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-[#2A2A2A]' : ''} ${idle ? 'opacity-50' : ''}">
        <span class="w-5 text-[10px] font-mono text-[#6B7280]">${i + 1}</span>
        ${th ? `<img src="${getTHImage(th)}" class="w-9 h-9 shrink-0 object-contain" alt="TH${th}"
                     onerror="this.style.visibility='hidden'">` : ''}
        <div class="min-w-0 flex-1 leading-tight">
            <p class="text-[12px] font-bold text-white truncate">${escapeHtml(m.name)}</p>
            <p class="text-[9px] font-semibold tracking-wide uppercase text-[#D4A72C]">
                ${info.role ? roleName(info.role) : 'Ex-member'}${th ? ` · TH${th}` : ''}
            </p>
            <p class="text-[9px] text-[#8B8F98]">${fmt(m.attacks)}/${fmt(limit)} attacks</p>
        </div>
        <div class="shrink-0 text-right leading-tight">
            <p class="text-[13px] font-bold text-[#D4A72C]">${fmt(m.capitalResourcesLooted)}</p>
            <p class="text-[7px] tracking-wide uppercase text-[#6B7280]">Capital Gold</p>
        </div>
    </div>`;
};

// Everyone in one list: attackers first (most gold on top), then members who have not attacked
const renderRaidDetail = (raid) => {
    const members = [...(raid.members || [])].sort((a, b) =>
        ((b.attacks || 0) > 0) - ((a.attacks || 0) > 0)
        || (b.capitalResourcesLooted || 0) - (a.capitalResourcesLooted || 0)
        || (b.attacks || 0) - (a.attacks || 0));
    const attacked = members.filter((m) => (m.attacks || 0) > 0).length;

    return pageShell(pageCard(`
        <div class="flex items-center gap-3 mb-3">
            <button type="button" data-raid-back aria-label="Back"
                    class="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white
                           flex items-center justify-center active:scale-90 transition-all">
                <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div class="leading-tight min-w-0">
                <h2 class="medieval text-lg font-bold text-white uppercase">Raid ${raidDate(raid) || ''}</h2>
                <p class="text-[10px] text-[#8B8F98]">${attacked}/${members.length} members attacked</p>
            </div>
        </div>
        ${members.length
            ? `<div class="rounded-xl overflow-hidden border border-[#2A2A2A]">${members.map(renderRaidMemberRow).join('')}</div>`
            : '<p class="text-sm text-gray-400 text-center py-6">No member data.</p>'}
    `));
};

const renderRaidList = (weeks) => pageShell(pageCard(`
    <div class="flex items-center gap-3 mb-3">
        <h2 class="medieval text-lg font-bold text-white uppercase">Raids</h2>
        <span class="text-[11px] text-[#8B8F98] font-mono">${weeks.length}</span>
    </div>
    <div class="flex flex-col gap-2">${weeks.map(renderRaidCard).join('')}</div>
`));

export function renderRaid() {
    const page = document.getElementById('section-raid');
    if (!page) return;

    const weeks = state.raids.length ? state.raids : (state.raid ? [state.raid] : []);
    const open = raidSelected !== null ? weeks[raidSelected] : null;
    if (!open) raidSelected = null;

    if (!weeks.length) {
        page.innerHTML = pageShell(`
            <div class="bg-[#1E1E1E] border border-[#3A3A3A] p-4 rounded-xl text-center text-gray-400">
                Raid data is not available yet.
            </div>`);
        return;
    }

    if (open) {
        page.innerHTML = renderRaidDetail(open);
        window.scrollTo(0, 0);
    } else {
        page.innerHTML = renderRaidList(weeks);
    }

    page.onclick = (e) => {
        if (e.target.closest('[data-raid-back]')) { raidSelected = null; renderRaid(); return; }
        const card = e.target.closest('[data-raid]');
        if (card) { raidSelected = Number(card.dataset.raid); renderRaid(); }
    };
}