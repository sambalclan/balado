import { parseCoCDate, escapeHtml, fmt, warDate, getTHImage, isEndedWar, warStars, emptyCard, backButton, renderMenuTabs, setMenuActive } from './constants.js';
import { state, getRaidWeeks, getCwlRounds, getCwlMemberStats } from './state.js';

// WAR
let warSelected = null;
let warCountdownTimer = null;

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
        <div class="flex items-center justify-center gap-1.5 mt-2 text-[10px] text-accent" data-war-countdown="${state.wars.indexOf(w)}">
            <span class="material-symbols-outlined text-[14px]">timer</span>
            <span class="text-muted">${timer.label}</span>
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

const RESULT_TEXT = {
    ongoing: 'text-accent',
    victory: 'text-win',
    defeat:  'text-lose',
    draw:    'text-subtle',
};

// Small picture shown in the war box: crying when we lose, cheering when we win
const RESULT_EMOTE = {
    victory: 'emotes/win.webp',
    defeat:  'emotes/lose.webp',
};

const RESULT_CHIP = {
    ongoing: 'bg-accent-soft text-accent',
    victory: 'bg-tint text-win',
    defeat:  'bg-tint text-lose',
    draw:    'bg-tint text-muted',
};

function warResult(w) {
    const result = (key, label) => ({ key, label, chip: RESULT_CHIP[key], text: RESULT_TEXT[key] });

    if (w.state === 'preparation') return result('ongoing', 'Preparation');
    if (!isEndedWar(w)) return result('ongoing', 'In war');

    const cs = w.clan?.stars || 0;
    const os = w.opponent?.stars || 0;
    const cd = w.clan?.destructionPercentage || 0;
    const od = w.opponent?.destructionPercentage || 0;

    if (cs > os || (cs === os && cd > od)) return result('victory', 'Win');
    if (cs < os || (cs === os && cd < od)) return result('defeat', 'Lose');
    return result('draw', 'Draw');
}

const warAttacksUsed = side => side?.attacks ?? (side?.members || []).reduce((n, m) => n + (m.attacks?.length || 0), 0);
const warAttacksMax = w => (w.teamSize || w.clan?.members?.length || 0) * (w.attacksPerMember || 2);
const isRunning = w => warResult(w).key === 'ongoing';
const warTime = w => parseCoCDate(w.endTime || w.startTime || w.preparationStartTime)?.getTime() || 0;

const resultChip = r => `<span class="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${r.chip}">${r.label}</span>`;

// Shared by the War list and the CWL rounds list (compact on purpose)
function renderMatchCard({ openAttr, label, w, countdown }) {
    const c = w.clan || {};
    const o = w.opponent || {};
    const r = warResult(w);
    const max = warAttacksMax(w);
    const cs = c.stars || 0;
    const os = o.stars || 0;
    const pct = v => (v || 0).toFixed(1) + '%';
    const score = (own, other) => `<span class="${own >= other ? 'text-main' : 'text-subtle'}">${own}</span>`;
    const badge = s => `<img src="${escapeHtml(s.badgeUrls?.small || '')}" class="w-8 h-8 shrink-0 object-contain" alt="">`;
    const info = (s, fallback, align) => `
        <div class="min-w-0 leading-tight ${align}">
            <p class="text-xs font-medium text-main truncate">${escapeHtml(s.name || fallback)}</p>
            <p class="text-[9px] text-subtle tabular-nums">${pct(s.destructionPercentage)} · ${warAttacksUsed(s)}/${max}</p>
        </div>`;

    return `
        <div ${openAttr} class="rounded-xl border border-line-soft bg-surface px-3 py-2.5 cursor-pointer active:scale-[0.99] transition-transform">
            <p class="flex items-center justify-center gap-1.5 pb-2 mb-2.5 border-b border-line-soft text-[11px] font-bold uppercase tracking-wider ${r.text}">
                ${RESULT_EMOTE[r.key] ? `<img src="${RESULT_EMOTE[r.key]}" width="32" height="32" alt="" decoding="async" class="w-8 h-8 object-contain">` : ''}${r.label}
            </p>
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div class="flex items-center gap-2 min-w-0">${badge(c)}${info(c, 'Clan', '')}</div>
                <p class="px-1 text-lg font-semibold tabular-nums leading-none">${score(cs, os)} <span class="text-faint">-</span> ${score(os, cs)}</p>
                <div class="flex items-center justify-end gap-2 min-w-0">${info(o, 'Opponent', 'text-right')}${badge(o)}</div>
            </div>
            <p class="mt-2 text-center text-[9px] text-subtle">${label}</p>
            ${countdown}
        </div>`;
}

const renderWarCard = w => renderMatchCard({
    openAttr: `data-war-open="${state.wars.indexOf(w)}"`,
    label: warDate(w) || '-',
    w,
    countdown: warCountdownHtml(w),
});

function sortedWars() {
    return [...state.wars].sort((a, b) => Number(isRunning(b)) - Number(isRunning(a)) || warTime(b) - warTime(a));
}

function renderWarList() {
    if (!state.wars.length) return emptyCard('War data is not available yet.');
    return sortedWars().map(renderWarCard).join('');
}

// WAR DETAILS
const renderStars = n => [1, 2, 3].map(i => `<span class="${i <= n ? 'text-accent' : 'text-empty'}">★</span>`).join('');

const renderAttackChip = a => `
    <div class="flex items-center justify-between gap-2 rounded-lg bg-tint-faint px-2 py-0.5">
        <span class="text-[11px] leading-none">${renderStars(a.stars || 0)}</span>
        <span class="text-[10px] font-bold text-main">${a.destructionPercentage || 0}%</span>
    </div>`;

function renderWarMemberRow(m, i, ended) {
    const attacks = m.attacks || [];
    const th = m.townhallLevel ?? m.townHallLevel;
    const missed = Math.max(m.__max - attacks.length, 0);
    const note = [`TH${th || '-'}`, attacks.length && missed && ended ? `${missed} missed` : ''].filter(Boolean).join(' · ');

    const right = attacks.length
        ? `<div class="shrink-0 w-[92px] flex flex-col gap-1">${attacks.map(renderAttackChip).join('')}</div>`
        : `<span class="shrink-0 text-[10px] text-subtle">${ended ? 'No attack' : 'Not yet'}</span>`;

    return `
        <div class="flex items-center gap-3 px-3 py-2.5 ${i ? 'border-t border-line-soft' : ''}">
            <span class="w-5 shrink-0 text-center text-[10px] font-mono text-subtle">${m.mapPosition ?? i + 1}</span>
            ${th ? `<img src="${getTHImage(th)}" class="w-9 h-9 shrink-0 object-contain" alt="TH${th}">` : ''}
            <div class="min-w-0 flex-1 leading-tight">
                <p class="text-xs font-bold text-main truncate">${escapeHtml(m.name)}</p>
                <p class="text-[9px] text-muted">${note}</p>
            </div>
            ${right}
        </div>`;
}

// Skipped when empty, so there is never an empty box
function renderWarMemberGroup(title, members, ended) {
    if (!members.length) return '';

    return `
        <div class="mb-4">
            <h4 class="text-[11px] font-bold text-accent uppercase mb-2">${title} (${members.length})</h4>
            <div class="rounded-xl overflow-hidden border border-line-soft bg-surface">
                ${members.map((m, i) => renderWarMemberRow(m, i, ended)).join('')}
            </div>
        </div>`;
}

// One card: both clans, the score, and the attack numbers under a thin line
function renderWarScoreboard(w, r, stats, countdown) {
    const c = w.clan || {};
    const o = w.opponent || {};
    const cs = c.stars || 0;
    const os = o.stars || 0;
    const side = s => `
        <div class="flex flex-col items-center gap-1 min-w-0">
            <img src="${escapeHtml(s.badgeUrls?.medium || s.badgeUrls?.small || '')}" class="w-14 h-14 object-contain" alt="">
            <p class="max-w-full text-[11px] font-semibold text-main truncate">${escapeHtml(s.name || 'Clan')}</p>
            <p class="text-[10px] text-subtle tabular-nums">${(s.destructionPercentage || 0).toFixed(1)}%</p>
        </div>`;
    const score = (own, other) => `<span class="${own >= other ? 'text-main' : 'text-subtle'}">${own}</span>`;
    const stat = ([label, value]) => `
        <div>
            <p class="text-sm font-bold text-main tabular-nums">${value}</p>
            <p class="text-[8px] tracking-wide text-subtle uppercase">${label}</p>
        </div>`;

    return `
        <div class="rounded-2xl border border-line-soft bg-surface p-3.5 mb-4">
            <div class="flex items-center justify-between mb-3">
                <span class="text-[10px] text-muted">${warDate(w) || '-'}</span>
                ${resultChip(r)}
            </div>
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                ${side(c)}
                <p class="text-3xl font-bold tabular-nums">${score(cs, os)} <span class="text-faint">-</span> ${score(os, cs)}</p>
                ${side(o)}
            </div>
            ${countdown}
            <div class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-line-soft text-center">${stats.map(stat).join('')}</div>
        </div>`;
}

function renderWarDetail(w, opts = {}) {
    const r = warResult(w);
    const ended = r.key !== 'ongoing';
    const max = w.attacksPerMember || 2;
    const members = (w.clan?.members || []).map(m => ({ ...m, __max: max }))
        .sort((a, b) => (a.mapPosition || 0) - (b.mapPosition || 0));

    const attacked = members.filter(m => (m.attacks || []).length)
        .sort((a, b) => warStars(b) - warStars(a));
    const notAttacked = members.filter(m => !(m.attacks || []).length);
    const used = members.reduce((n, m) => n + (m.attacks || []).length, 0);
    const triples = members.reduce((n, m) => n + (m.attacks || []).filter(a => a.stars === 3).length, 0);
    const stats = [
        ['Attacks', `${used}/${members.length * max}`],
        ['3 Stars', triples],
        ['Missed', ended ? Math.max(members.length * max - used, 0) : '-'],
    ];

    return `
        <div class="flex items-center gap-3 mb-3">
            ${backButton(opts.backAttr || 'data-war-back')}
            <h2 class="text-lg font-semibold text-main truncate">${escapeHtml(opts.heading || `vs ${w.opponent?.name || 'Opponent'}`)}</h2>
        </div>
        ${renderWarScoreboard(w, r, stats, opts.countdown ?? warCountdownHtml(w))}
        ${renderWarMemberGroup('Attacked', attacked, ended)}
        ${renderWarMemberGroup('Not attacked', notAttacked, ended)}
    `;
}

// WAR PAGE
export function renderWar(wars) {
    const container = document.getElementById('section-war');
    if (!container) return;

    clearInterval(warCountdownTimer);
    state.wars = (Array.isArray(wars) ? wars : wars ? [wars] : [])
        .filter(w => w && w.state !== 'notInWar' && (w.clan || w.opponent || w.state));

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

    container.innerHTML = `
        <p class="mb-2 px-1 text-[10px] text-subtle">${state.wars.length} wars</p>
        <div id="warList" class="flex flex-col gap-1.5">${renderWarList()}</div>
    `;

    startWarCountdown(container);

    container.onclick = e => {
        const card = e.target.closest('[data-war-open]');
        if (card) {
            warSelected = Number(card.dataset.warOpen);
            renderWar(state.wars);
        }
    };
}

// CWL
// getCwlRounds() returns one entry per saved round of the latest season.
// Our clan is always w.clan there, even when the API listed it as the opponent.
let cwlSelected = null; // round number of the open war
let cwlView = 'rounds';
let cwlCountdownTimer = null;

const CWL_VIEWS = [
    { id: 'rounds', label: 'Rounds' },
    { id: 'members', label: 'Members' }
];

function cwlCountdownHtml(w) {
    const timer = warCountdown(w);
    if (!timer) return '';

    return `
        <div class="flex items-center justify-center gap-1.5 mt-2 text-[10px] text-accent" data-cwl-countdown="${w.__round}">
            <span class="material-symbols-outlined text-[14px]">timer</span>
            <span class="text-muted">${timer.label}</span>
            <span class="font-mono font-bold tabular-nums" data-cwl-time>${timer.time}</span>
        </div>`;
}

function startCwlCountdown(container) {
    clearInterval(cwlCountdownTimer);

    const update = () => {
        if (!container.isConnected) return clearInterval(cwlCountdownTimer);

        const rounds = getCwlRounds();
        container.querySelectorAll('[data-cwl-countdown]').forEach(el => {
            const w = rounds.find(x => x.__round === Number(el.dataset.cwlCountdown));
            const timer = w && warCountdown(w);
            if (!timer) return el.remove();

            const time = el.querySelector('[data-cwl-time]');
            if (time) time.textContent = timer.time;
        });
    };

    update();
    cwlCountdownTimer = setInterval(update, 1000);
}

function cwlSummary(rounds) {
    const done = rounds.filter(isEndedWar);
    const count = key => done.filter(w => warResult(w).key === key).length;
    const stars = rounds.reduce((n, w) => n + (w.clan?.stars || 0), 0);
    const avg = done.length ? (done.reduce((n, w) => n + (w.clan?.stars || 0), 0) / done.length).toFixed(1) : '-';

    return [
        { label: 'Record (W-L-D)', value: `${count('victory')}-${count('defeat')}-${count('draw')}`, color: 'text-accent' },
        { label: 'Total stars', value: stars, color: 'text-main' },
        { label: 'Avg stars', value: avg, color: 'text-main' }
    ];
}

const renderCwlCard = w => renderMatchCard({
    openAttr: `data-cwl-open="${w.__round}"`,
    label: `Round ${w.__round} · ${warDate(w) || '-'}`,
    w,
    countdown: cwlCountdownHtml(w),
});

function renderCwlMemberRow(m, i) {
    return `
        <div class="flex items-center gap-2 px-2.5 py-1.5 ${i ? 'border-t border-line-soft' : ''}">
            <span class="w-4 text-[9px] font-mono text-subtle">${i + 1}</span>
            ${m.th ? `<img src="${getTHImage(m.th)}" class="w-6 h-6 object-contain shrink-0" alt="TH${m.th}" onerror="this.style.visibility='hidden'">` : ''}
            <div class="min-w-0 flex-1 leading-tight">
                <p class="text-[11px] font-bold text-main truncate">${escapeHtml(m.name)}</p>
                <p class="text-[8px] text-muted">TH${m.th || '-'} · ${m.attacks}/${m.rounds} attacks</p>
            </div>
            <span class="text-[10px] font-bold ${m.stars ? 'text-accent' : 'text-subtle'}">${m.stars}★</span>
        </div>`;
}

function renderCwlBody(rounds) {
    if (cwlView === 'members') {
        const members = [...getCwlMemberStats().values()]
            .sort((a, b) => b.stars - a.stars || b.attacks - a.attacks || String(a.name).localeCompare(String(b.name)));

        return members.length
            ? `<div class="rounded-xl overflow-hidden border border-line-soft bg-surface">${members.map(renderCwlMemberRow).join('')}</div>`
            : '<p class="text-sm text-subtle text-center py-6">No member data yet.</p>';
    }

    // Newest round first
    return `<div class="flex flex-col gap-1.5">${[...rounds].reverse().map(renderCwlCard).join('')}</div>`;
}

export function renderCwl() {
    const container = document.getElementById('section-cwl');
    if (!container) return;

    clearInterval(cwlCountdownTimer);

    const rounds = getCwlRounds();
    const group = state.cwl;
    const season = String(rounds[0]?.__season || group?.season || '-').slice(0, 7);

    if (!rounds.length) {
        container.innerHTML = group
            ? `
                <p class="mb-3 px-1 text-[11px] text-muted">${escapeHtml(season)}</p>
                ${emptyCard('No CWL wars saved yet.')}`
            : emptyCard('CWL data is not available yet.');
        return;
    }

    const open = cwlSelected !== null ? rounds.find(w => w.__round === cwlSelected) : null;
    if (!open) cwlSelected = null;

    if (open) {
        container.innerHTML = renderWarDetail(open, {
            backAttr: 'data-cwl-back',
            heading: `Round ${open.__round} · vs ${open.opponent?.name || 'Opponent'}`,
            countdown: cwlCountdownHtml(open)
        });
        startCwlCountdown(container);
        window.scrollTo(0, 0);
    } else {
        const total = group?.rounds?.length || rounds.length;
        const tile = ({ label, value, color }) => `
            <div class="rounded-lg border border-line-soft bg-surface px-2 py-1.5 text-center leading-tight">
                <p class="text-[13px] font-bold ${color}">${value}</p>
                <p class="text-[7px] tracking-wide uppercase text-subtle mt-0.5">${label}</p>
            </div>`;

        container.innerHTML = `
            <p class="mb-3 px-1 text-[11px] text-muted">${escapeHtml(season)} · ${rounds.length} / ${total} rounds</p>
            <div class="grid grid-cols-3 gap-1.5 mb-3">${cwlSummary(rounds).map(tile).join('')}</div>
            ${renderMenuTabs('data-cwl-view', CWL_VIEWS, cwlView)}
            <div id="cwlBody">${renderCwlBody(rounds)}</div>
        `;
        startCwlCountdown(container);
    }

    container.onclick = e => {
        if (e.target.closest('[data-cwl-back]')) {
            cwlSelected = null;
            renderCwl();
            return;
        }

        const tab = e.target.closest('[data-cwl-view]');
        if (tab) {
            cwlView = tab.dataset.cwlView;
            setMenuActive(tab.closest('.switch-box'), 'data-cwl-view', cwlView);
            container.querySelector('#cwlBody').innerHTML = renderCwlBody(getCwlRounds());
            startCwlCountdown(container);
            return;
        }

        const card = e.target.closest('[data-cwl-open]');
        if (card) {
            cwlSelected = Number(card.dataset.cwlOpen);
            renderCwl();
        }
    };
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

const raidStat = (icon, label, value, color = 'text-main') => `
    <div class="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 min-w-0">
        <span class="material-symbols-outlined text-[19px] text-accent">${icon}</span>
        <div class="min-w-0">
            <p class="text-[13px] font-bold ${color} truncate">${value}</p>
            <p class="text-[9px] text-muted">${label}</p>
        </div>
    </div>`;

function renderRaidCard(w, i) {
    const s = raidStats(w);
    const targets = raidTargets(w);
    const clan = state.clan || {};

    return `
        <div data-raid="${i}" class="bg-surface border border-line-soft rounded-2xl p-3.5 cursor-pointer active:scale-[0.99] transition-transform">
            <div class="flex items-center justify-between mb-3">
                <span class="text-[10px] text-muted">${warDate(w) || '-'}</span>
                <span class="flex items-center gap-1 text-[9px] font-semibold text-accent">
                    RAID WEEKEND
                    <span class="material-symbols-outlined text-[15px]">chevron_right</span>
                </span>
            </div>

            <div class="flex items-center gap-3 mb-3">
                <img src="${escapeHtml(clan.badgeUrls?.small || '')}" class="w-10 h-10 object-contain shrink-0" alt="">
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-main truncate">${escapeHtml(clan.name || 'Clan')}</p>
                    <p class="text-[10px] text-muted">${s.attacked}/${s.members.length} members participated</p>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-lg font-bold text-accent">${fmt(s.gold)}</p>
                    <p class="text-[9px] text-muted">Capital Gold</p>
                </div>
            </div>

            <div class="mb-3">
                <div class="flex justify-between text-[9px] text-muted mb-1.5">
                    <span>Participation</span>
                    <span>${s.progress}%</span>
                </div>
                <div class="h-1.5 rounded-full bg-track overflow-hidden">
                    <div class="h-full rounded-full bg-accent transition-all duration-500" style="width:${s.progress}%"></div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
                ${raidStat('swords', 'Total Attacks', fmt(s.attacks))}
                ${raidStat('flag', 'Districts Destroyed', fmt(s.districts))}
            </div>

            ${targets.length ? `
                <div class="flex items-center gap-1.5 mt-3 pt-3 border-t border-line-soft overflow-x-auto">
                    ${targets.slice(0, 5).map(t => `
                        <span class="flex items-center gap-1 bg-surface-2 rounded-lg px-2 py-1 shrink-0">
                            ${t.badge ? `<img src="${escapeHtml(t.badge)}" class="w-4 h-4" alt="">` : ''}
                            <span class="text-[9px] text-muted max-w-[90px] truncate">${escapeHtml(t.name)}</span>
                        </span>`).join('')}
                    ${targets.length > 5 ? `<span class="text-[9px] text-subtle">+${targets.length - 5}</span>` : ''}
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
        <div class="flex items-center gap-3 px-3 py-2.5 ${i ? 'border-t border-line-soft' : ''}">
            <span class="w-5 text-[10px] font-mono text-subtle">${i + 1}</span>
            ${th ? `<img src="${getTHImage(th)}" class="w-9 h-9 object-contain shrink-0" alt="TH${th}">` : ''}
            <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-main truncate">${escapeHtml(m.name)}</p>
                <p class="text-[9px] text-muted">${used}/${limit} attacks ${th ? `· TH${th}` : ''}</p>
            </div>
            <div class="text-right shrink-0">
                <p class="text-xs font-bold ${used ? 'text-accent' : 'text-subtle'}">${fmt(gold)}</p>
                <p class="text-[8px] text-subtle">Capital Gold</p>
            </div>
        </div>`;
}

function renderRaidDetail(w) {
    const s = raidStats(w);
    const members = [...s.members].sort((a, b) =>
        (b.capitalResourcesLooted || 0) - (a.capitalResourcesLooted || 0) ||
        (b.attacks || 0) - (a.attacks || 0)
    );

    return `
        <div class="flex items-center gap-3 mb-4">
            ${backButton('data-raid-back')}
            <div class="min-w-0">
                <h2 class="text-lg font-semibold text-main">Raid Weekend</h2>
                <p class="text-[10px] text-muted">${warDate(w) || '-'}</p>
            </div>
        </div>

        <div class="rounded-2xl border border-line-soft bg-surface p-3 mb-4">
            <p class="text-[10px] text-muted mb-1">Total Capital Gold</p>
            <p class="text-2xl font-bold text-accent mb-3">${fmt(s.gold)}</p>
            <div class="grid grid-cols-2 gap-2">
                ${raidStat('swords', 'Total Attacks', fmt(s.attacks))}
                ${raidStat('flag', 'Districts Destroyed', fmt(s.districts))}
            </div>
            <div class="flex justify-between text-[10px] text-muted mt-3 mb-1.5">
                <span>Participation</span>
                <span>${s.attacked}/${s.members.length} (${s.progress}%)</span>
            </div>
            <div class="h-1.5 rounded-full bg-track overflow-hidden">
                <div class="h-full rounded-full bg-accent" style="width:${s.progress}%"></div>
            </div>
        </div>

        <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-bold text-accent uppercase">Member Contributions</h3>
            <span class="text-[10px] text-muted">${members.length} members</span>
        </div>
        <div class="rounded-xl overflow-hidden border border-line-soft bg-surface">
            ${members.length ? members.map(renderRaidMemberRow).join('') : '<p class="text-xs text-muted p-4 text-center">No member data.</p>'}
        </div>
    `;
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

    page.innerHTML = open ? renderRaidDetail(open) : `
        <p class="mb-3 px-1 text-[11px] text-muted">${weeks.length} raid weekends recorded</p>
        <div class="flex flex-col gap-3">${weeks.map(renderRaidCard).join('')}</div>
    `;

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