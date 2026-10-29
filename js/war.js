import { parseCoCDate, escapeHtml, roleName, fmt, warDate, getTHImage, renderAreaChart, dayLabel, isEndedWar, warStars, pageCard, emptyCard, backButton, renderPillTabs, setPillActive } from './constants.js';
import { state, getRaidWeeks } from './state.js';

// ═══ War · List ════════════════════════════════════════════════════════
let warFilter = 'all';
let warSelected = null; // index in state.wars of the opened war, or null for the list

const WAR_FILTERS = [
    { id: 'all',     label: 'All' },
    { id: 'victory', label: 'Victory' },
    { id: 'defeat',  label: 'Defeat' },
    { id: 'draw',    label: 'Draw' },
];

function formatWarStartTime(w) {
    const date = parseCoCDate(w.startTime || w.preparationStartTime);
    if (!date) return '-';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function warResult(w) {
    if (w.state === 'preparation') return { key: 'ongoing', label: 'PREPARATION', color: 'text-[#D4A72C]' };
    if (!isEndedWar(w)) return { key: 'ongoing', label: 'IN WAR', color: 'text-[#D4A72C]' };

    const cs = w.clan?.stars || 0, os = w.opponent?.stars || 0;
    const cd = w.clan?.destructionPercentage || 0, od = w.opponent?.destructionPercentage || 0;
    if (cs > os || (cs === os && cd > od)) return { key: 'victory', label: 'VICTORY', color: 'text-green-500' };
    if (cs < os || (cs === os && cd < od)) return { key: 'defeat', label: 'LOSS', color: 'text-red-500' };
    return { key: 'draw', label: 'DRAW', color: 'text-gray-400' };
}

const warAttacksUsed = (side) =>
    side?.attacks ?? (side?.members || []).reduce((n, m) => n + (m.attacks?.length || 0), 0);

const warAttacksMax = (w) =>
    (w.teamSize || w.clan?.members?.length || 0) * (w.attacksPerMember || 2);

const WAR_ACCENT = { victory: 'bg-green-500', defeat: 'bg-red-500', draw: 'bg-gray-400', ongoing: 'bg-[#D4A72C]' };

const attackBar = (used, max) => `
    <div class="h-1 rounded-full bg-[#2A2A2A] overflow-hidden">
        <div class="h-full rounded-full bg-[#D4A72C]" style="width:${max ? Math.min(100, Math.round((used / max) * 100)) : 0}%"></div>
    </div>`;

const renderWarCard = (w) => {
    const c = w.clan || {}, o = w.opponent || {};
    const r = warResult(w);
    const max = warAttacksMax(w);
    const pct = (v) => (v || 0).toFixed(1) + '%';

    const startTimeHtml = w.state === 'preparation'
        ? `<span class="text-[#D4A72C] font-semibold">Start Time: ${formatWarStartTime(w)}</span>`
        : '';

    return `
    <div data-war-open="${state.wars.indexOf(w)}" class="relative overflow-hidden bg-[#1E1E1E] border border-[#3A3A3A] rounded-xl pl-4 pr-3 py-2.5 cursor-pointer active:scale-[0.99] transition-transform">
        <span class="absolute left-0 top-0 bottom-0 w-1 ${WAR_ACCENT[r.key]}"></span>
        <div class="flex items-center justify-between text-[9px] font-mono tracking-wide text-[#8B8F98] mb-1">
            <span>${warDate(w) || '-'}</span>
            ${startTimeHtml}
            <span class="material-symbols-outlined text-[14px] text-[#6B7280]">chevron_right</span>
        </div>
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div class="flex items-center gap-2 min-w-0">
                <img src="${c.badgeUrls?.small || ''}" class="w-8 h-8 shrink-0 object-contain" alt="" onerror="this.style.visibility='hidden'">
                <div class="min-w-0 leading-tight">
                    <p class="text-xs font-bold text-white truncate">${escapeHtml(c.name || '')}</p>
                    <p class="text-[9px] text-[#6B7280]">${warAttacksUsed(c)}/${max} Atks</p>
                </div>
            </div>
            <div class="text-center leading-tight">
                <p class="inline-block px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-bold tracking-widest ${r.color}">${r.label}</p>
                <p class="medieval text-lg font-bold ${r.color}">${c.stars || 0} - ${o.stars || 0}</p>
                <p class="text-[8px] text-[#6B7280]">${pct(c.destructionPercentage)} vs ${pct(o.destructionPercentage)}</p>
            </div>
            <div class="flex items-center justify-end gap-2 min-w-0">
                <div class="min-w-0 leading-tight text-right">
                    <p class="text-xs font-bold text-white truncate">${escapeHtml(o.name || 'Opponent')}</p>
                    <p class="text-[9px] text-[#6B7280]">${warAttacksUsed(o)}/${max} Atks</p>
                </div>
                <img src="${o.badgeUrls?.small || ''}" class="w-8 h-8 shrink-0 object-contain" alt="" onerror="this.style.visibility='hidden'">
            </div>
        </div>
        <div class="mt-2 grid grid-cols-2 gap-4">
            ${attackBar(warAttacksUsed(c), max)}
            ${attackBar(warAttacksUsed(o), max)}
        </div>
    </div>`;
};

// Running wars first (preparation and in war), then finished wars newest first
const isRunning = (w) => warResult(w).key === 'ongoing';
const warTime = (w) => parseCoCDate(w.endTime || w.startTime || w.preparationStartTime)?.getTime() || 0;
const filterWars = () => [...state.wars]
    .sort((a, b) => (isRunning(b) - isRunning(a)) || (warTime(b) - warTime(a)))
    .filter((w) => warFilter === 'all' || warResult(w).key === warFilter);

const renderWarList = () => {
    const shown = filterWars();
    const count = document.getElementById('warCount');
    if (count) count.textContent = `${shown.length} / ${state.wars.length}`;
    return shown.length
        ? shown.map(renderWarCard).join('')
        : '<p class="text-sm text-gray-500 text-center py-6">No wars found.</p>';
};

// ═══ War · Statistics (chart is shown on About) ════════════════════════
// Summary of all finished wars, shown under the chart
function warSummary(done) {
    const count = (key) => done.filter((w) => warResult(w).key === key).length;
    const avg = (v) => (done.length ? v / done.length : 0);

    const won = count('victory'), lost = count('defeat'), drawn = count('draw');
    const stars = done.reduce((n, w) => n + (w.clan?.stars || 0), 0);

    return [
        { label: 'Record (W-L-D)', value: `${won}-${lost}-${drawn}`, color: 'text-[#D4A72C]' },
        { label: 'Win rate', value: Math.round(avg(won) * 100) + '%', color: 'text-green-500' },
        { label: 'Avg stars', value: avg(stars).toFixed(1) },
    ];
}

// "Stars per war" chart, shown on the dashboard (About)
export const renderWarChartCard = () => {
    const done = state.wars
        .filter((w) => isEndedWar(w) && warDate(w))
        .reverse(); // index is newest first -> flip to oldest first

    return renderAreaChart({
        title: 'War',
        subtitle: 'Stars per war (last 7)',
        points: done.slice(-7).map((w) => ({ label: dayLabel(warDate(w)), value: w.clan?.stars || 0 })),
        stats: done.length ? warSummary(done) : [],
        note: done.length ? `Summary of ${done.length} finished wars` : '',
    });
};

// ═══ War · Detail (who attacked and who did not) ═══════════════════════
const renderStars = (n) => [1, 2, 3].map((i) =>
    `<span class="${i <= n ? 'text-[#F5C542]' : 'text-[#3A3A3A]'}">★</span>`).join('');

const starColor = (n) => (n >= 3 ? 'border-[#6B5A1E] bg-[#2A2410]' : n > 0 ? 'border-[#3A3A3A] bg-[#252525]' : 'border-[#4a2323] bg-[#2a1818]');

const renderAttackChip = (a) => `
    <div class="flex items-center justify-between gap-2 rounded-lg border ${starColor(a.stars || 0)} px-2 py-0.5">
        <span class="text-[11px] leading-none tracking-tighter">${renderStars(a.stars || 0)}</span>
        <span class="text-[10px] font-bold text-white tabular-nums">${a.destructionPercentage || 0}%</span>
    </div>`;

const renderWarMemberRow = (m, i, ended) => {
    const attacks = m.attacks || [];
    const th = m.townhallLevel ?? m.townHallLevel;
    const stars = warStars(m);
    const missed = Math.max(m.__max - attacks.length, 0);
    const pending = ended ? 'No attack' : 'Not yet';

    const right = attacks.length
        ? `<div class="shrink-0 w-[92px] flex flex-col gap-1">
               ${attacks.map(renderAttackChip).join('')}
               ${missed && ended ? `<span class="text-center text-[8px] font-semibold uppercase tracking-wide text-red-400">${missed} missed</span>` : ''}
           </div>`
        : `<span class="shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold border
                ${ended ? 'text-red-400 border-[#4a2323] bg-[#2a1818]' : 'text-[#8B8F98] border-[#3A3A3A] bg-[#252525]'}">${pending}</span>`;

    return `
    <div class="row-in flex items-center gap-3 px-3 py-2.5 ${i > 0 ? 'border-t border-[#2A2A2A]' : ''}" style="--i:${Math.min(i, 14)}">
        <span class="shrink-0 w-6 h-6 rounded-md bg-[#252525] border border-[#2F2F2F] flex items-center justify-center text-[10px] font-mono font-bold text-[#8B8F98]">${m.mapPosition ?? i + 1}</span>
        ${th ? `<img src="${getTHImage(th)}" class="w-9 h-9 shrink-0 object-contain" alt="TH${th}" onerror="this.style.visibility='hidden'">` : ''}
        <div class="min-w-0 flex-1 leading-tight">
            <p class="text-[12px] font-bold text-white truncate">${escapeHtml(m.name)}</p>
            <p class="text-[9px] text-[#8B8F98]">${th ? `TH${th} · ` : ''}${attacks.length}/${m.__max} attacks${attacks.length ? ` · <span class="text-[#D4A72C] font-semibold">${stars}★</span>` : ''}</p>
        </div>
        ${right}
    </div>`;
};

const renderWarMemberGroup = (title, dot, members, ended) => `
    <div class="flex items-center gap-2 mb-2">
        <span class="w-1.5 h-1.5 rounded-full ${dot}"></span>
        <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide">${title}</h4>
        <span class="text-[9px] font-mono text-[#8B8F98] bg-[#252525] px-1.5 py-0.5 rounded-md">${members.length}</span>
    </div>
    ${members.length
        ? `<div class="rounded-xl overflow-hidden border border-[#2A2A2A] bg-[#1E1E1E] mb-4">${members.map((m, i) => renderWarMemberRow(m, i, ended)).join('')}</div>`
        : '<p class="text-xs text-[#8B8F98] mb-4 pl-3.5">-</p>'}`;

const renderWarStat = (label, value, color = 'text-white') => `
    <div class="rounded-lg bg-[#141414] border border-[#2A2A2A] px-1.5 py-1.5 text-center leading-tight">
        <p class="text-[13px] font-bold ${color}">${value}</p>
        <p class="text-[7px] tracking-wide uppercase text-[#6B7280] mt-0.5">${label}</p>
    </div>`;

const renderWarScoreboard = (w, r) => {
    const c = w.clan || {}, o = w.opponent || {};
    const pct = (v) => (v || 0).toFixed(1) + '%';
    const side = (s, name, align) => `
        <div class="flex flex-col items-center gap-1 min-w-0 ${align}">
            <img src="${s.badgeUrls?.medium || s.badgeUrls?.small || ''}" class="w-12 h-12 object-contain drop-shadow-[0_0_8px_rgba(212,167,44,0.25)]" alt="" onerror="this.style.visibility='hidden'">
            <p class="text-[11px] font-bold text-white truncate max-w-full">${escapeHtml(name)}</p>
            <p class="text-[9px] font-mono text-[#8B8F98]">${pct(s.destructionPercentage)}</p>
        </div>`;

    return `
    <div class="rounded-2xl border border-[#3A3A3A] p-3 mb-3"
         style="background: radial-gradient(120% 140% at 50% 0%, rgba(212,167,44,0.14) 0%, rgba(30,30,30,0) 60%), #1E1E1E;">
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            ${side(c, c.name || 'Clan', '')}
            <div class="text-center leading-tight px-1">
                <p class="text-[9px] font-semibold tracking-widest ${r.color}">${r.label}</p>
                <p class="medieval text-2xl font-bold ${r.color}">${c.stars || 0} <span class="text-[#6B7280]">-</span> ${o.stars || 0}</p>
                <p class="text-[8px] text-[#6B7280]">${warDate(w) || '-'}</p>
            </div>
            ${side(o, o.name || 'Opponent', '')}
        </div>
    </div>`;
};

function renderWarDetail(w) {
    const r = warResult(w);
    const ended = r.key !== 'ongoing';
    const max = w.attacksPerMember || 2;
    const members = (w.clan?.members || []).map((m) => ({ ...m, __max: max }))
        .sort((a, b) => (a.mapPosition || 0) - (b.mapPosition || 0));

    const attacked = members.filter((m) => (m.attacks || []).length > 0)
        .sort((a, b) => warStars(b) - warStars(a) || (a.mapPosition || 0) - (b.mapPosition || 0));
    const idle = members.filter((m) => !(m.attacks || []).length);

    const used = members.reduce((n, m) => n + (m.attacks || []).length, 0);
    const totalStars = members.reduce((n, m) => n + warStars(m), 0);
    const missed = Math.max(members.length * max - used, 0);
    const threeStars = members.reduce((n, m) => n + (m.attacks || []).filter((a) => a.stars === 3).length, 0);

    return pageCard(`
        <div class="detail-in">
        <div class="flex items-center gap-3 mb-3">
            ${backButton('data-war-back')}
            <div class="leading-tight min-w-0">
                <h2 class="medieval text-lg font-bold text-white uppercase truncate">vs ${escapeHtml(w.opponent?.name || 'Opponent')}</h2>
                <p class="text-[10px] text-[#8B8F98]">${members.length} members · ${max} attacks each</p>
            </div>
        </div>
        ${renderWarScoreboard(w, r)}
        <div class="grid grid-cols-4 gap-1.5 mb-4">
            ${renderWarStat('Attacks', `${used}/${members.length * max}`)}
            ${renderWarStat('Stars', totalStars, 'text-[#F5C542]')}
            ${renderWarStat('3 Stars', threeStars, 'text-green-500')}
            ${renderWarStat('Missed', ended ? missed : '-', ended && missed ? 'text-red-400' : 'text-white')}
        </div>
        ${renderWarMemberGroup('Attacked', 'bg-green-500', attacked, ended)}
        ${renderWarMemberGroup('Not attacked', ended ? 'bg-red-500' : 'bg-[#6B7280]', idle, ended)}
        </div>
    `);
}

// ═══ War · Page ════════════════════════════════════════════════════════
export function renderWar(wars) {
    const container = document.getElementById('section-war');
    if (!container) return;

    state.wars = (Array.isArray(wars) ? wars : wars ? [wars] : [])
        .filter((w) => w && w.state !== 'notInWar' && (w.clan || w.opponent || w.state));

    if (state.wars.length === 0) {
        container.innerHTML = emptyCard('War data is not available yet.');
        return;
    }

    const open = warSelected !== null ? state.wars[warSelected] : null;
    if (!open) warSelected = null;

    if (open) {
        container.innerHTML = renderWarDetail(open);
        window.scrollTo(0, 0);
        container.onclick = (e) => {
            if (e.target.closest('[data-war-back]')) { warSelected = null; renderWar(state.wars); }
        };
        return;
    }

    container.innerHTML = pageCard(`
        <div class="flex items-center gap-3 mb-3">
            <h2 class="medieval text-lg font-bold text-white uppercase">Wars</h2>
            <span id="warCount" class="text-[11px] text-[#8B8F98] font-mono">${state.wars.length} / ${state.wars.length}</span>
        </div>

        ${renderPillTabs('data-war', WAR_FILTERS, warFilter)}

        <div id="warList" class="flex flex-col gap-2">${renderWarList()}</div>
    `);

    container.onclick = (e) => {
        const btn = e.target.closest('[data-war]');
        if (btn) {
            warFilter = btn.dataset.war;
            setPillActive(btn.closest('.pill-tabs'), 'data-war', warFilter);
            container.querySelector('#warList').innerHTML = renderWarList();
            return;
        }
        const card = e.target.closest('[data-war-open]');
        if (card) { warSelected = Number(card.dataset.warOpen); renderWar(state.wars); }
    };
}

// ═══ CWL ═══════════════════════════════════════════════════════════════
export function renderCwl() {
    const container = document.getElementById('section-cwl');
    if (!container) return;

    if (!state.cwl) {
        container.innerHTML = emptyCard('CWL data is not available yet.');
        return;
    }

    const cwl = state.cwl;
    const rounds = cwl.rounds || [];
    const members = cwl.clan?.members || [];

    const renderCwlMember = (m, i) => {
        const stars = rounds.reduce((sum, r) => sum + (r.attacks?.find((a) => a.attackerTag === m.tag)?.stars || 0), 0);
        const attacks = rounds.filter((r) => r.attacks?.some((a) => a.attackerTag === m.tag)).length;
        return `
        <div class="flex items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-[#2A2A2A]' : ''}">
            <img src="${getTHImage(m.townHallLevel)}" class="w-9 h-9 shrink-0 object-contain" alt="TH${m.townHallLevel}" onerror="this.style.visibility='hidden'">
            <div class="min-w-0 flex-1 leading-tight">
                <p class="text-[12px] font-bold text-white truncate">${escapeHtml(m.name)}</p>
                <p class="text-[9px] text-[#8B8F98]">TH${m.townHallLevel}</p>
            </div>
            <span class="shrink-0 text-[10px] font-bold text-[#D4A72C]">${stars}★ · ${attacks}/${rounds.length}</span>
        </div>`;
    };

    container.innerHTML = pageCard(`
        <div class="flex items-center gap-3 mb-3">
            <h2 class="medieval text-lg font-bold text-white uppercase">CWL</h2>
            <span class="text-[11px] text-[#8B8F98] font-mono">${cwl.season || '-'}</span>
        </div>
        <div class="rounded-xl overflow-hidden border border-[#2A2A2A] mb-4">
            ${members.map(renderCwlMember).join('')}
        </div>
        <p class="text-[10px] text-[#8B8F98]">${rounds.length} rounds</p>
    `);
}

// ═══ Raid (one card per weekend, click it to see every member) ═════════
let raidSelected = null; // index of the opened weekend, or null for the list

// Clans attacked during a raid weekend (from the attack log)
const raidTargets = (w) => (Array.isArray(w.attackLog) ? w.attackLog : []).map((e) => ({
    name: e.defender?.name || 'Unknown clan',
    badge: e.defender?.badgeUrls?.small || '',
}));

const renderRaidCard = (w, i) => {
    const mine = state.clan || {};
    const attackers = (w.members || []).filter((m) => (m.attacks || 0) > 0).length;
    const targets = raidTargets(w);
    return `
    <div data-raid="${i}" class="relative overflow-hidden bg-[#1E1E1E] border border-[#3A3A3A] rounded-xl pl-4 pr-3 py-2.5 cursor-pointer active:scale-[0.99] transition-transform">
        <span class="absolute left-0 top-0 bottom-0 w-1 ${attackers < 15 ? 'bg-red-500' : 'bg-green-500'}"></span>
        <div class="flex items-center justify-between text-[9px] font-mono tracking-wide text-[#8B8F98] mb-1">
            <span>${warDate(w) || '-'}</span>
            <span class="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-bold ${attackers < 15 ? 'text-red-500' : 'text-green-500'}">${attackers}/${(w.members || []).length} attacked</span>
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
                <p class="inline-block px-2 py-0.5 rounded-full bg-[#2A2410] border border-[#6B5A1E] text-[8px] font-bold tracking-widest text-[#D4A72C]">RAID</p>
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
    <div class="row-in flex items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-[#2A2A2A]' : ''} ${idle ? 'opacity-50' : ''}" style="--i:${Math.min(i, 14)}">
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

    return pageCard(`
        <div class="detail-in">
        <div class="flex items-center gap-3 mb-3">
            ${backButton('data-raid-back')}
            <div class="leading-tight min-w-0">
                <h2 class="medieval text-lg font-bold text-white uppercase">Raid ${warDate(raid) || ''}</h2>
                <p class="text-[10px] text-[#8B8F98]">${attacked}/${members.length} members attacked</p>
            </div>
        </div>
        ${members.length
            ? `<div class="rounded-xl overflow-hidden border border-[#2A2A2A]">${members.map(renderRaidMemberRow).join('')}</div>`
            : '<p class="text-sm text-gray-400 text-center py-6">No member data.</p>'}
        </div>
    `);
};

const renderRaidList = (weeks) => pageCard(`
    <div class="flex items-center gap-3 mb-3">
        <h2 class="medieval text-lg font-bold text-white uppercase">Raids</h2>
        <span class="text-[11px] text-[#8B8F98] font-mono">${weeks.length}</span>
    </div>
    <div class="flex flex-col gap-2">${weeks.map(renderRaidCard).join('')}</div>
`);

export function renderRaid() {
    const page = document.getElementById('section-raid');
    if (!page) return;

    const weeks = getRaidWeeks();
    const open = raidSelected !== null ? weeks[raidSelected] : null;
    if (!open) raidSelected = null;

    if (!weeks.length) {
        page.innerHTML = emptyCard('Raid data is not available yet.');
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
