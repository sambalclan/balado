import {
    parseCoCDate, escapeHtml, roleName, fmt, warDate, getTHImage,
    renderAreaChart, dayLabel, isEndedWar, warStars, pageCard,
    emptyCard, backButton, renderPillTabs, setPillActive
} from './constants.js';
import { state, getRaidWeeks } from './state.js';

// WAR
let warFilter = 'all';
let warSelected = null;
let warCountdownTimer = null;

const WAR_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'victory', label: 'Victory' },
    { id: 'defeat', label: 'Defeat' },
    { id: 'draw', label: 'Draw' }
];

function warCountdown(w) {
    if (isEndedWar(w)) return null;
    const preparing = w.state === 'preparation';
    const target = parseCoCDate(preparing ? w.startTime : w.endTime);
    if (!target || Number.isNaN(target.getTime())) return null;

    const remaining = Math.max(0, target.getTime() - Date.now());
    const seconds = Math.floor(remaining / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = n => String(n).padStart(2, '0');

    return {
        label: preparing ? 'War starts in' : 'War ends in',
        time: `${days ? days + 'd ' : ''}${pad(hours)}:${pad(minutes)}:${pad(secs)}`
    };
}

function warCountdownHtml(w) {
    const timer = warCountdown(w);
    if (!timer) return '';

    return `
        <div class="flex items-center justify-center gap-1.5 mt-2 text-[10px] text-[#D4A72C]" data-war-countdown="${state.wars.indexOf(w)}">
            <span class="material-symbols-outlined text-[14px]">timer</span>
            <span class="text-[#A0A0A0]">${timer.label}</span>
            <span class="font-mono font-bold tabular-nums" data-war-time>${timer.time}</span>
        </div>`;
}

function startWarCountdown(container) {
    clearInterval(warCountdownTimer);

    const update = () => {
        if (!container.isConnected) {
            clearInterval(warCountdownTimer);
            return;
        }

        container.querySelectorAll('[data-war-countdown]').forEach(el => {
            const w = state.wars[Number(el.dataset.warCountdown)];
            const timer = w && warCountdown(w);
            if (!timer) return el.remove();

            const time = el.querySelector('[data-war-time]');
            if (time) time.textContent = timer.time;
        });
    };

    update();
    warCountdownTimer = setInterval(update, 1000);
}

function warResult(w) {
    if (w.state === 'preparation') return { key: 'ongoing', label: 'PREPARATION', color: 'text-[#D4A72C]' };
    if (!isEndedWar(w)) return { key: 'ongoing', label: 'IN WAR', color: 'text-[#D4A72C]' };

    const cs = w.clan?.stars || 0;
    const os = w.opponent?.stars || 0;
    const cd = w.clan?.destructionPercentage || 0;
    const od = w.opponent?.destructionPercentage || 0;

    if (cs > os || (cs === os && cd > od)) return { key: 'victory', label: 'VICTORY', color: 'text-green-500' };
    if (cs < os || (cs === os && cd < od)) return { key: 'defeat', label: 'LOSS', color: 'text-red-500' };
    return { key: 'draw', label: 'DRAW', color: 'text-gray-400' };
}

const warAttacksUsed = side => side?.attacks ?? (side?.members || []).reduce((n, m) => n + (m.attacks?.length || 0), 0);
const warAttacksMax = w => (w.teamSize || w.clan?.members?.length || 0) * (w.attacksPerMember || 2);
const isRunning = w => warResult(w).key === 'ongoing';
const warTime = w => parseCoCDate(w.endTime || w.startTime || w.preparationStartTime)?.getTime() || 0;

function renderWarCard(w) {
    const c = w.clan || {};
    const o = w.opponent || {};
    const r = warResult(w);
    const max = warAttacksMax(w);
    const pct = v => (v || 0).toFixed(1) + '%';

    return `
        <div data-war-open="${state.wars.indexOf(w)}" class="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl px-3 py-3 cursor-pointer active:scale-[0.99] transition-transform">
            <div class="flex items-center justify-between text-[9px] font-mono text-[#8B8F98] mb-2">
                <span>${warDate(w) || '-'}</span>
                <span class="material-symbols-outlined text-[14px]">chevron_right</span>
            </div>
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <img src="${escapeHtml(c.badgeUrls?.small || '')}" class="w-8 h-8 shrink-0 object-contain" alt="">
                    <div class="min-w-0 leading-tight">
                        <p class="text-xs font-bold text-white truncate">${escapeHtml(c.name || '')}</p>
                        <p class="text-[9px] text-[#6B7280]">${warAttacksUsed(c)}/${max} Atks</p>
                    </div>
                </div>
                <div class="text-center leading-tight">
                    <p class="text-[9px] font-semibold ${r.color}">${r.label}</p>
                    <p class="medieval text-lg font-bold text-white">${c.stars || 0} - ${o.stars || 0}</p>
                    <p class="text-[8px] text-[#6B7280]">${pct(c.destructionPercentage)} vs ${pct(o.destructionPercentage)}</p>
                </div>
                <div class="flex items-center justify-end gap-2 min-w-0">
                    <div class="min-w-0 leading-tight text-right">
                        <p class="text-xs font-bold text-white truncate">${escapeHtml(o.name || 'Opponent')}</p>
                        <p class="text-[9px] text-[#6B7280]">${warAttacksUsed(o)}/${max} Atks</p>
                    </div>
                    <img src="${escapeHtml(o.badgeUrls?.small || '')}" class="w-8 h-8 shrink-0 object-contain" alt="">
                </div>
            </div>
            ${warCountdownHtml(w)}
        </div>`;
}

function filterWars() {
    return [...state.wars]
        .sort((a, b) => Number(isRunning(b)) - Number(isRunning(a)) || warTime(b) - warTime(a))
        .filter(w => warFilter === 'all' || warResult(w).key === warFilter);
}

function renderWarList() {
    const shown = filterWars();
    const count = document.getElementById('warCount');
    if (count) count.textContent = `${shown.length} / ${state.wars.length}`;
    return shown.length ? shown.map(renderWarCard).join('') : '<p class="text-sm text-gray-500 text-center py-6">No wars found.</p>';
}

// WAR STATISTICS
function warSummary(done) {
    const count = key => done.filter(w => warResult(w).key === key).length;
    const avg = value => done.length ? value / done.length : 0;
    const won = count('victory');
    const lost = count('defeat');
    const drawn = count('draw');
    const stars = done.reduce((n, w) => n + (w.clan?.stars || 0), 0);

    return [
        { label: 'Record (W-L-D)', value: `${won}-${lost}-${drawn}`, color: 'text-[#D4A72C]' },
        { label: 'Win rate', value: Math.round(avg(won) * 100) + '%', color: 'text-green-500' },
        { label: 'Avg stars', value: avg(stars).toFixed(1) }
    ];
}

export function getWarChartData() {
    const done = state.wars.filter(w => isEndedWar(w) && warDate(w)).reverse();
    return {
        points: done.slice(-7).map(w => ({ date: warDate(w), value: w.clan?.stars || 0 })),
        stats: done.length ? warSummary(done) : [],
        total: done.length
    };
}

export function renderWarChartCard(bare = false) {
    const done = state.wars.filter(w => isEndedWar(w) && warDate(w)).reverse();
    return renderAreaChart({
        title: 'War',
        subtitle: 'Stars per war (last 7)',
        points: done.slice(-7).map(w => ({ label: dayLabel(warDate(w)), value: w.clan?.stars || 0 })),
        stats: done.length ? warSummary(done) : [],
        note: done.length ? `Summary of ${done.length} finished wars` : '',
        bare
    });
}

// WAR DETAILS
const renderStars = n => [1, 2, 3].map(i => `<span class="${i <= n ? 'text-[#F5C542]' : 'text-[#3A3A3A]'}">★</span>`).join('');

const renderAttackChip = a => `
    <div class="flex items-center justify-between gap-2 rounded-lg border border-[#2A2A2A] bg-[#252525] px-2 py-0.5">
        <span class="text-[11px] leading-none">${renderStars(a.stars || 0)}</span>
        <span class="text-[10px] font-bold text-white">${a.destructionPercentage || 0}%</span>
    </div>`;

function renderWarMemberRow(m, i, ended) {
    const attacks = m.attacks || [];
    const th = m.townhallLevel ?? m.townHallLevel;
    const stars = warStars(m);
    const missed = Math.max(m.__max - attacks.length, 0);
    const pending = ended ? 'No attack' : 'Not yet';

    const right = attacks.length
        ? `<div class="shrink-0 w-[92px] flex flex-col gap-1">
            ${attacks.map(renderAttackChip).join('')}
            ${missed && ended ? `<span class="text-center text-[8px] text-red-400">${missed} missed</span>` : ''}
           </div>`
        : `<span class="shrink-0 rounded-lg px-2 py-1 text-[10px] border border-[#2A2A2A] ${ended ? 'text-red-400' : 'text-gray-400'}">${pending}</span>`;

    return `
        <div class="flex items-center gap-3 px-3 py-2.5 ${i ? 'border-t border-[#2A2A2A]' : ''}">
            <span class="w-6 h-6 shrink-0 rounded-md bg-[#252525] flex items-center justify-center text-[10px] text-gray-400">${m.mapPosition ?? i + 1}</span>
            ${th ? `<img src="${getTHImage(th)}" class="w-9 h-9 shrink-0 object-contain" alt="TH${th}">` : ''}
            <div class="min-w-0 flex-1 leading-tight">
                <p class="text-xs font-bold text-white truncate">${escapeHtml(m.name)}</p>
                <p class="text-[9px] text-gray-400">TH${th || '-'} · ${attacks.length}/${m.__max} attacks ${attacks.length ? `· ${stars}★` : ''}</p>
            </div>
            ${right}
        </div>`;
}

function renderWarMemberGroup(title, members, ended) {
    return `
        <div class="mb-4">
            <h4 class="text-[11px] font-bold text-[#D4A72C] uppercase mb-2">${title} (${members.length})</h4>
            <div class="rounded-xl overflow-hidden border border-[#2A2A2A]">
                ${members.length ? members.map((m, i) => renderWarMemberRow(m, i, ended)).join('') : '<p class="text-xs text-gray-500 p-3">No members</p>'}
            </div>
        </div>`;
}

function renderWarScoreboard(w, r) {
    const c = w.clan || {};
    const o = w.opponent || {};
    const side = s => `
        <div class="flex flex-col items-center gap-1 min-w-0">
            <img src="${escapeHtml(s.badgeUrls?.medium || s.badgeUrls?.small || '')}" class="w-12 h-12 object-contain" alt="">
            <p class="text-[11px] font-bold text-white truncate max-w-full">${escapeHtml(s.name || 'Clan')}</p>
            <p class="text-[9px] text-gray-400">${(s.destructionPercentage || 0).toFixed(1)}%</p>
        </div>`;

    return `
        <div class="rounded-xl border border-[#2A2A2A] bg-[#1E1E1E] p-3 mb-3">
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                ${side(c)}
                <div class="text-center">
                    <p class="text-[9px] font-semibold ${r.color}">${r.label}</p>
                    <p class="medieval text-2xl font-bold text-white">${c.stars || 0} - ${o.stars || 0}</p>
                    <p class="text-[8px] text-gray-500">${warDate(w) || '-'}</p>
                </div>
                ${side(o)}
            </div>
        </div>`;
}

function renderWarDetail(w) {
    const r = warResult(w);
    const ended = r.key !== 'ongoing';
    const max = w.attacksPerMember || 2;
    const members = (w.clan?.members || []).map(m => ({ ...m, __max: max }))
        .sort((a, b) => (a.mapPosition || 0) - (b.mapPosition || 0));

    const attacked = members.filter(m => (m.attacks || []).length)
        .sort((a, b) => warStars(b) - warStars(a));
    const notAttacked = members.filter(m => !(m.attacks || []).length);
    const used = members.reduce((n, m) => n + (m.attacks || []).length, 0);
    const stars = members.reduce((n, m) => n + warStars(m), 0);
    const missed = Math.max(members.length * max - used, 0);
    const triples = members.reduce((n, m) => n + (m.attacks || []).filter(a => a.stars === 3).length, 0);

    const stat = (label, value) => `
        <div class="rounded-lg bg-[#252525] p-2 text-center">
            <p class="text-sm font-bold text-white">${value}</p>
            <p class="text-[8px] text-gray-400 uppercase">${label}</p>
        </div>`;

    return pageCard(`
        <div class="flex items-center gap-3 mb-3">
            ${backButton('data-war-back')}
            <div class="min-w-0">
                <h2 class="text-lg font-bold text-white truncate">vs ${escapeHtml(w.opponent?.name || 'Opponent')}</h2>
                <p class="text-[10px] text-gray-400">${members.length} members · ${max} attacks each</p>
            </div>
        </div>
        ${renderWarScoreboard(w, r)}
        <div class="mb-3">${warCountdownHtml(w)}</div>
        <div class="grid grid-cols-4 gap-2 mb-4">
            ${stat('Attacks', `${used}/${members.length * max}`)}
            ${stat('Stars', stars)}
            ${stat('3 Stars', triples)}
            ${stat('Missed', ended ? missed : '-')}
        </div>
        ${renderWarMemberGroup('Attacked', attacked, ended)}
        ${renderWarMemberGroup('Not attacked', notAttacked, ended)}
    `);
}

// WAR PAGE
export function renderWar(wars) {
    const container = document.getElementById('section-war');
    if (!container) return;

    clearInterval(warCountdownTimer);
    state.wars = (Array.isArray(wars) ? wars : wars ? [wars] : [])
        .filter(w => w && w.state !== 'notInWar' && (w.clan || w.opponent || w.state));

    if (!state.wars.length) {
        container.innerHTML = emptyCard('War data is not available yet.');
        return;
    }

    const open = warSelected !== null ? state.wars[warSelected] : null;
    if (!open) warSelected = null;

    if (open) {
        container.innerHTML = renderWarDetail(open);
        startWarCountdown(container);
        window.scrollTo(0, 0);
        container.onclick = e => {
            if (e.target.closest('[data-war-back]')) {
                warSelected = null;
                renderWar(state.wars);
            }
        };
        return;
    }

    container.innerHTML = pageCard(`
        <div class="flex items-center gap-3 mb-3">
            <h2 class="medieval text-lg font-bold text-white uppercase">Wars</h2>
            <span id="warCount" class="text-[11px] text-gray-400">${state.wars.length}</span>
        </div>
        ${renderPillTabs('data-war', WAR_FILTERS, warFilter)}
        <div id="warList" class="flex flex-col gap-2">${renderWarList()}</div>
    `);

    startWarCountdown(container);

    container.onclick = e => {
        const btn = e.target.closest('[data-war]');
        if (btn) {
            warFilter = btn.dataset.war;
            setPillActive(btn.closest('.pill-tabs'), 'data-war', warFilter);
            container.querySelector('#warList').innerHTML = renderWarList();
            startWarCountdown(container);
            return;
        }

        const card = e.target.closest('[data-war-open]');
        if (card) {
            warSelected = Number(card.dataset.warOpen);
            renderWar(state.wars);
        }
    };
}

// CWL
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

    const renderMember = (m, i) => {
        const stars = rounds.reduce((n, r) => n + (r.attacks?.find(a => a.attackerTag === m.tag)?.stars || 0), 0);
        const attacks = rounds.filter(r => r.attacks?.some(a => a.attackerTag === m.tag)).length;

        return `
            <div class="flex items-center gap-3 px-3 py-2 ${i ? 'border-t border-[#2A2A2A]' : ''}">
                <img src="${getTHImage(m.townHallLevel)}" class="w-9 h-9 object-contain" alt="">
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-bold text-white truncate">${escapeHtml(m.name)}</p>
                    <p class="text-[9px] text-gray-400">TH${m.townHallLevel}</p>
                </div>
                <span class="text-[10px] font-bold text-[#D4A72C]">${stars}★ · ${attacks}/${rounds.length}</span>
            </div>`;
    };

    container.innerHTML = pageCard(`
        <div class="flex items-center gap-3 mb-3">
            <h2 class="text-lg font-bold text-white">CWL</h2>
            <span class="text-[11px] text-gray-400">${escapeHtml(cwl.season || '-')}</span>
        </div>
        <div class="rounded-xl overflow-hidden border border-[#2A2A2A]">
            ${members.map(renderMember).join('')}
        </div>
        <p class="text-[10px] text-gray-400 mt-3">${rounds.length} rounds</p>
    `);
}

// RAID
let raidSelected = null;

const raidTargets = w => (w.attackLog || []).map(e => ({
    name: e.defender?.name || 'Unknown Clan',
    badge: e.defender?.badgeUrls?.small || ''
}));

const raidStats = w => {
    const members = w.members || [];
    const attacked = members.filter(m => (m.attacks || 0) > 0).length;
    const attacks = w.totalAttacks ?? members.reduce((n, m) => n + (m.attacks || 0), 0);
    const gold = w.capitalTotalLoot ?? members.reduce((n, m) => n + (m.capitalResourcesLooted || 0), 0);
    const districts = w.enemyDistrictsDestroyed || 0;
    const progress = members.length ? Math.round(attacked / members.length * 100) : 0;
    return { members, attacked, attacks, gold, districts, progress };
};

const raidStat = (icon, label, value, color = 'text-white') => `
    <div class="flex items-center gap-2 rounded-xl bg-[#252525] px-3 py-2.5 min-w-0">
        <span class="material-symbols-outlined text-[19px] text-[#D4A72C]">${icon}</span>
        <div class="min-w-0">
            <p class="text-[13px] font-bold ${color} truncate">${value}</p>
            <p class="text-[9px] text-gray-400">${label}</p>
        </div>
    </div>`;

function renderRaidCard(w, i) {
    const s = raidStats(w);
    const targets = raidTargets(w);
    const clan = state.clan || {};

    return `
        <div data-raid="${i}" class="bg-[#1E1E1E] border border-[#2A2A2A] rounded-2xl p-3.5 cursor-pointer active:scale-[0.99] transition-transform">
            <div class="flex items-center justify-between mb-3">
                <span class="text-[10px] text-gray-400">${warDate(w) || '-'}</span>
                <span class="flex items-center gap-1 text-[9px] font-semibold text-[#D4A72C]">
                    RAID WEEKEND
                    <span class="material-symbols-outlined text-[15px]">chevron_right</span>
                </span>
            </div>

            <div class="flex items-center gap-3 mb-3">
                <img src="${escapeHtml(clan.badgeUrls?.small || '')}" class="w-10 h-10 object-contain shrink-0" alt="">
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-white truncate">${escapeHtml(clan.name || 'Clan')}</p>
                    <p class="text-[10px] text-gray-400">${s.attacked}/${s.members.length} members participated</p>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-lg font-bold text-[#D4A72C]">${fmt(s.gold)}</p>
                    <p class="text-[9px] text-gray-400">Capital Gold</p>
                </div>
            </div>

            <div class="mb-3">
                <div class="flex justify-between text-[9px] text-gray-400 mb-1.5">
                    <span>Participation</span>
                    <span>${s.progress}%</span>
                </div>
                <div class="h-1.5 rounded-full bg-[#333] overflow-hidden">
                    <div class="h-full rounded-full bg-[#D4A72C] transition-all duration-500" style="width:${s.progress}%"></div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
                ${raidStat('swords', 'Total Attacks', fmt(s.attacks))}
                ${raidStat('flag', 'Districts Destroyed', fmt(s.districts))}
            </div>

            ${targets.length ? `
                <div class="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#2A2A2A] overflow-x-auto">
                    ${targets.slice(0, 5).map(t => `
                        <span class="flex items-center gap-1 bg-[#252525] rounded-lg px-2 py-1 shrink-0">
                            ${t.badge ? `<img src="${escapeHtml(t.badge)}" class="w-4 h-4" alt="">` : ''}
                            <span class="text-[9px] text-gray-400 max-w-[90px] truncate">${escapeHtml(t.name)}</span>
                        </span>`).join('')}
                    ${targets.length > 5 ? `<span class="text-[9px] text-gray-500">+${targets.length - 5}</span>` : ''}
                </div>` : ''}
        </div>`;
}

function renderRaidMemberRow(m, i) {
    const info = (state.clan?.memberList || []).find(c => c.tag === m.tag) || {};
    const th = info.townHallLevel;
    const limit = (m.attackLimit || 0) + (m.bonusAttackLimit || 0);
    const used = m.attacks || 0;
    const gold = m.capitalResourcesLooted || 0;

    return `
        <div class="flex items-center gap-3 px-3 py-2.5 ${i ? 'border-t border-[#2A2A2A]' : ''}">
            <span class="w-5 text-[10px] font-mono text-gray-500">${i + 1}</span>
            ${th ? `<img src="${getTHImage(th)}" class="w-9 h-9 object-contain shrink-0" alt="TH${th}">` : ''}
            <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-white truncate">${escapeHtml(m.name)}</p>
                <p class="text-[9px] text-gray-400">${used}/${limit} attacks ${th ? `· TH${th}` : ''}</p>
            </div>
            <div class="text-right shrink-0">
                <p class="text-xs font-bold ${used ? 'text-[#D4A72C]' : 'text-gray-500'}">${fmt(gold)}</p>
                <p class="text-[8px] text-gray-500">Capital Gold</p>
            </div>
        </div>`;
}

function renderRaidDetail(w) {
    const s = raidStats(w);
    const members = [...s.members].sort((a, b) =>
        (b.capitalResourcesLooted || 0) - (a.capitalResourcesLooted || 0) ||
        (b.attacks || 0) - (a.attacks || 0)
    );

    return pageCard(`
        <div class="flex items-center gap-3 mb-4">
            ${backButton('data-raid-back')}
            <div class="min-w-0">
                <h2 class="text-lg font-bold text-white">Raid Weekend</h2>
                <p class="text-[10px] text-gray-400">${warDate(w) || '-'}</p>
            </div>
        </div>

        <div class="rounded-2xl bg-[#1E1E1E] border border-[#2A2A2A] p-3 mb-4">
            <p class="text-[10px] text-gray-400 mb-1">Total Capital Gold</p>
            <p class="text-2xl font-bold text-[#D4A72C] mb-3">${fmt(s.gold)}</p>
            <div class="grid grid-cols-2 gap-2">
                ${raidStat('swords', 'Total Attacks', fmt(s.attacks))}
                ${raidStat('flag', 'Districts Destroyed', fmt(s.districts))}
            </div>
            <div class="flex justify-between text-[10px] text-gray-400 mt-3 mb-1.5">
                <span>Participation</span>
                <span>${s.attacked}/${s.members.length} (${s.progress}%)</span>
            </div>
            <div class="h-1.5 rounded-full bg-[#333] overflow-hidden">
                <div class="h-full rounded-full bg-[#D4A72C]" style="width:${s.progress}%"></div>
            </div>
        </div>

        <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-bold text-[#D4A72C] uppercase">Member Contributions</h3>
            <span class="text-[10px] text-gray-400">${members.length} members</span>
        </div>
        <div class="rounded-xl overflow-hidden border border-[#2A2A2A] bg-[#1E1E1E]">
            ${members.length ? members.map(renderRaidMemberRow).join('') : '<p class="text-xs text-gray-400 p-4 text-center">No member data.</p>'}
        </div>
    `);
}

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

    page.innerHTML = open ? renderRaidDetail(open) : pageCard(`
        <div class="flex items-center justify-between mb-3">
            <div>
                <h2 class="text-lg font-bold text-white">Raid Weekends</h2>
                <p class="text-[10px] text-gray-400">${weeks.length} raid weekends recorded</p>
            </div>
            <span class="material-symbols-outlined text-[#D4A72C] text-[23px]">fort</span>
        </div>
        <div class="flex flex-col gap-3">${weeks.map(renderRaidCard).join('')}</div>
    `);

    page.onclick = e => {
        if (e.target.closest('[data-raid-back]')) {
            raidSelected = null;
            renderRaid();
            return;
        }
        const card = e.target.closest('[data-raid]');
        if (card) {
            raidSelected = Number(card.dataset.raid);
            renderRaid();
        }
    };
}