import { parseCoCDate, escapeHtml, warDate, getTHImage, pillHtml, slidePill } from './constants.js';
import { state } from './state.js';
import { renderAreaChart, dayLabel } from './chart.js';

// ── War page ──
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
    if (!['warEnded', 'ended'].includes(w.state)) return { key: 'ongoing', label: 'IN WAR', color: 'text-[#D4A72C]' };

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

const renderWarCard = (w) => {
    const c = w.clan || {}, o = w.opponent || {};
    const r = warResult(w);
    const max = warAttacksMax(w);
    const pct = (v) => (v || 0).toFixed(1) + '%';

    const startTimeHtml = w.state === 'preparation'
        ? `<span class="text-[#D4A72C] font-semibold">Start Time: ${formatWarStartTime(w)}</span>`
        : '';

    return `
    <div data-war-open="${state.wars.indexOf(w)}" class="bg-[#1E1E1E] border border-[#3A3A3A] rounded-xl px-3 py-2 cursor-pointer active:scale-[0.99] transition-transform">
        <div class="flex items-center justify-between text-[9px] font-mono tracking-wide text-[#8B8F98] mb-1">
            <span>${warDate(w) || '-'}</span>
            ${startTimeHtml}
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
                <p class="text-[9px] font-semibold tracking-widest ${r.color}">${r.label}</p>
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
    </div>`;
};

// Running wars first (preparation and in war), then finished wars in their original order
const isRunning = (w) => warResult(w).key === 'ongoing';
const filterWars = () => [...state.wars]
    .sort((a, b) => {
        // Running wars first
        const aRunning = isRunning(a), bRunning = isRunning(b);
        if (aRunning !== bRunning) return bRunning - aRunning;
        // Then finished wars: newest first
        const aDate = parseCoCDate(a.endTime || a.startTime || a.preparationStartTime)?.getTime() || 0;
        const bDate = parseCoCDate(b.endTime || b.startTime || b.preparationStartTime)?.getTime() || 0;
        return bDate - aDate;
    })
    .filter((w) => warFilter === 'all' || warResult(w).key === warFilter);

const renderWarList = () => {
    const shown = filterWars();
    const count = document.getElementById('warCount');
    if (count) count.textContent = `${shown.length} / ${state.wars.length}`;
    return shown.length
        ? shown.map(renderWarCard).join('')
        : '<p class="text-sm text-gray-500 text-center py-6">No wars found.</p>';
};

// Summary of all finished wars, shown under the chart
function warSummary(done) {
    const count = (key) => done.filter((w) => warResult(w).key === key).length;
    const sum = (fn) => done.reduce((n, w) => n + fn(w), 0);
    const avg = (v) => (done.length ? v / done.length : 0);

    const won = count('victory'), lost = count('defeat'), drawn = count('draw');
    const stars = sum((w) => w.clan?.stars || 0);

    return [
        { label: 'Record (W-L-D)', value: `${won}-${lost}-${drawn}`, color: 'text-[#D4A72C]' },
        { label: 'Win rate', value: Math.round(avg(won) * 100) + '%', color: 'text-green-500' },
        { label: 'Avg stars', value: avg(stars).toFixed(1) },
    ];
}

// "Stars per war" chart, shown on the dashboard (About)
export const renderWarChartCard = () => {
    const done = state.wars
        .filter((w) => ['warEnded', 'ended'].includes(w.state) && warDate(w))
        .reverse(); // index is newest first -> flip to oldest first

    return renderAreaChart({
        title: 'War',
        subtitle: 'Stars per war (last 7)',
        points: done.slice(-7).map((w) => ({ label: dayLabel(warDate(w)), value: w.clan?.stars || 0 })),
        stats: done.length ? warSummary(done) : [],
        note: done.length ? `Summary of ${done.length} finished wars` : '',
    });
};

const renderWarFilterButton = ({ id, label }) => {
    const style = id === warFilter ? 'text-[#D4A72C]' : 'text-[#6B7280]';
    return `
        <button type="button" data-war="${id}"
                class="relative z-10 py-1.5 rounded-lg text-[9px] font-semibold tracking-wide uppercase ${style}
                       active:scale-95 transition-all">${label}</button>
    `;
};

// ── War detail: who attacked and who did not ──
const fmtPct = (v) => (v || 0) + '%';

const renderWarMemberRow = (m, i, ended) => {
    const attacks = m.attacks || [];
    const th = m.townhallLevel ?? m.townHallLevel;
    const text = attacks.length
        ? attacks.map((a) => `${a.stars || 0}★ ${fmtPct(a.destructionPercentage)}`).join(' · ')
        : (ended ? 'No attack' : 'Not yet');
    const color = attacks.length ? 'text-[#D4A72C]' : (ended ? 'text-red-400' : 'text-[#8B8F98]');
    return `
    <div class="flex items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-[#2A2A2A]' : ''}">
        <span class="w-5 text-[10px] font-mono text-[#6B7280]">${m.mapPosition ?? i + 1}</span>
        ${th ? `<img src="${getTHImage(th)}" class="w-9 h-9 shrink-0 object-contain" alt="TH${th}" onerror="this.style.visibility='hidden'">` : ''}
        <div class="min-w-0 flex-1 leading-tight">
            <p class="text-[12px] font-bold text-white truncate">${escapeHtml(m.name)}</p>
            <p class="text-[9px] text-[#8B8F98]">${th ? `TH${th} · ` : ''}${attacks.length}/${m.__max} attacks</p>
        </div>
        <span class="shrink-0 text-[10px] font-bold ${color}">${text}</span>
    </div>`;
};

const renderWarMemberGroup = (title, members, ended) => `
    <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide mb-2">${title} (${members.length})</h4>
    ${members.length
        ? `<div class="rounded-xl overflow-hidden border border-[#2A2A2A] mb-4">${members.map((m, i) => renderWarMemberRow(m, i, ended)).join('')}</div>`
        : '<p class="text-xs text-[#8B8F98] mb-4">-</p>'}`;

function renderWarDetail(w) {
    const r = warResult(w);
    const ended = r.key !== 'ongoing';
    const max = w.attacksPerMember || 2;
    const members = (w.clan?.members || []).map((m) => ({ ...m, __max: max }))
        .sort((a, b) => (a.mapPosition || 0) - (b.mapPosition || 0));
    const stars = (m) => (m.attacks || []).reduce((n, a) => n + (a.stars || 0), 0);

    const attacked = members.filter((m) => (m.attacks || []).length > 0)
        .sort((a, b) => stars(b) - stars(a) || (a.mapPosition || 0) - (b.mapPosition || 0));
    const idle = members.filter((m) => !(m.attacks || []).length);

    return `
    <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3">
        <div class="flex items-center gap-3 mb-3">
            <button type="button" data-war-back aria-label="Back"
                    class="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white
                           flex items-center justify-center active:scale-90 transition-all">
                <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div class="leading-tight min-w-0">
                <h2 class="medieval text-lg font-bold text-white uppercase truncate">vs ${escapeHtml(w.opponent?.name || 'Opponent')}</h2>
                <p class="text-[10px] text-[#8B8F98]">${warDate(w) || '-'} · <span class="${r.color}">${r.label}</span> · ${w.clan?.stars || 0} - ${w.opponent?.stars || 0}</p>
            </div>
        </div>
        ${renderWarMemberGroup('Attacked', attacked, ended)}
        ${renderWarMemberGroup('Not attacked', idle, ended)}
    </div>`;
}

export function renderWar(wars) {
    const container = document.getElementById('section-war');
    if (!container) return;

    state.wars = (Array.isArray(wars) ? wars : wars ? [wars] : [])
        .filter((w) => w && w.state !== 'notInWar' && (w.clan || w.opponent || w.state));

    if (state.wars.length === 0) {
        container.innerHTML = `
            <div class="bg-[#1E1E1E] border border-[#3A3A3A] p-4 rounded-xl text-center text-gray-400">
                War data is not available yet.
            </div>
        `;
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

    container.innerHTML = `
        <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3">
            <div class="flex items-center gap-3 mb-3">
                <h2 class="medieval text-lg font-bold text-white uppercase">Wars</h2>
                <span id="warCount" class="text-[11px] text-[#8B8F98] font-mono">${state.wars.length} / ${state.wars.length}</span>
                <button id="warRefresh" type="button" aria-label="Refresh"
                        class="ml-1 text-[#8B8F98] active:scale-90 transition-transform">
                    <span class="material-symbols-outlined text-[18px]">sync</span>
                </button>
            </div>

            <div class="relative grid grid-cols-4 gap-1 p-1 mb-3 rounded-xl bg-[#141414] border border-[#2A2A2A]">
                ${pillHtml('warPill', WAR_FILTERS.length, WAR_FILTERS.findIndex((f) => f.id === warFilter))}
                ${WAR_FILTERS.map(renderWarFilterButton).join('')}
            </div>

            <div id="warList" class="flex flex-col gap-2">${renderWarList()}</div>
        </div>
    `;

    slidePill(container, 'warPill', WAR_FILTERS.findIndex((f) => f.id === warFilter));

    container.onclick = (e) => {
        const btn = e.target.closest('[data-war]');
        if (btn) { warFilter = btn.dataset.war; renderWar(state.wars); return; }
        const card = e.target.closest('[data-war-open]');
        if (card) { warSelected = Number(card.dataset.warOpen); renderWar(state.wars); }
    };
    container.querySelector('#warRefresh').onclick = () => window.syncData?.();
}

export function renderCwl() {
    const container = document.getElementById('section-cwl');
    if (!container) return;

    if (!state.cwl) {
        container.innerHTML = `
            <div class="bg-[#1E1E1E] border border-[#3A3A3A] p-4 rounded-xl text-center text-gray-400">
                CWL data is not available yet.
            </div>
        `;
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

    container.innerHTML = `
        <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3">
            <div class="flex items-center gap-3 mb-3">
                <h2 class="medieval text-lg font-bold text-white uppercase">CWL</h2>
                <span class="text-[11px] text-[#8B8F98] font-mono">${cwl.season || '-'}</span>
            </div>
            <div class="rounded-xl overflow-hidden border border-[#2A2A2A] mb-4">
                ${members.map(renderCwlMember).join('')}
            </div>
            <p class="text-[10px] text-[#8B8F98]">${rounds.length} rounds</p>
        </div>
    `;
}
