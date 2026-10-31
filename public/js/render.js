import { escapeHtml, fmt, renderCombinedChart, warStars, warDate, isEndedWar, pagePanel, backButton } from './constants.js';
import { state, getRaidWeeks } from './state.js';
import { getLiveLog, LIVE_API_URL } from './api.js';
import { getWarChartData } from './war.js';

// CONFIG
const ACCENT = '#D4A72C';
const FONT = 'Arial, Helvetica, sans-serif';
const SCALE = 3;
const L = { pad: 24, cellPad: 12, rowH: 30, headH: 34, headBlock: 88, minWidth: 520 };
const THEME = { bg: '#ffffff', text: '#111111', sub: '#555555', line: '#c4c4c4', zebra: '#f5f5f5', border: '#d1d5db' };
const shortDate = (d, opts) => d.toLocaleDateString('en-US', opts);

const COLUMNS = [
    { label: 'No', get: (m, i) => i + 1 },
    { label: 'Name', get: m => m.name },
    { label: 'TH', get: m => m.th ?? '-' },
    { label: 'Wars', get: m => m.wars },
    { label: 'Attacks', get: m => `${m.attacks}/${m.attackLimit}` },
    { label: 'Stars', get: m => m.stars },
    { label: 'Destruction', get: m => m.attacks ? Math.round(m.destruction / m.attacks) + '%' : '-' },
    { label: 'Raid Atks', get: m => `${m.raidAttacks}/${m.raidLimit}` },
    { label: 'Capital Gold', get: m => fmt(m.raidGold) }
];

// MONTHLY REPORT
function lastMonthRange(now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(end.getTime() - 86400000);
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const day = { day: 'numeric', month: 'short' };
    return {
        from: iso(start), to: iso(end),
        label: shortDate(start, { month: 'long', year: 'numeric' }),
        span: `${shortDate(start, day)} - ${shortDate(lastDay, day)}`
    };
}

function collectMonthStats({ from, to }) {
    const inRange = rec => {
        const d = warDate(rec);
        return d >= from && d < to;
    };
    const wars = (state.wars || []).filter(w => isEndedWar(w) && inRange(w));
    const raids = getRaidWeeks().filter(inRange);
    const rows = new Map();

    const row = (tag, name, th) => {
        if (!rows.has(tag)) rows.set(tag, {
            name, th, wars: 0, attacks: 0, attackLimit: 0,
            stars: 0, destruction: 0, raidAttacks: 0,
            raidLimit: 0, raidGold: 0
        });
        const r = rows.get(tag);
        if (th && !r.th) r.th = th;
        return r;
    };

    (state.clan?.memberList || []).forEach(m => row(m.tag, m.name, m.townHallLevel));

    wars.forEach(w => (w.clan?.members || []).forEach(m => {
        const r = row(m.tag, m.name, m.townhallLevel ?? m.townHallLevel);
        r.wars++;
        r.attackLimit += w.attacksPerMember || 2;
        r.attacks += (m.attacks || []).length;
        r.stars += warStars(m);
        r.destruction += (m.attacks || []).reduce((n, a) => n + (a.destructionPercentage || 0), 0);
    }));

    raids.forEach(w => (w.members || []).forEach(m => {
        const r = row(m.tag, m.name);
        r.raidAttacks += m.attacks || 0;
        r.raidLimit += (m.attackLimit || 0) + (m.bonusAttackLimit || 0);
        r.raidGold += m.capitalResourcesLooted || 0;
    }));

    const list = [...rows.values()].sort((a, b) =>
        b.stars - a.stars || b.raidGold - a.raidGold ||
        String(a.name).localeCompare(String(b.name))
    );
    return { list, wars: wars.length, raids: raids.length };
}

function makeMonthReport() {
    const range = lastMonthRange();
    const { list, wars, raids } = collectMonthStats(range);
    const empty = !wars && !raids;
    return {
        title: `Statistics ${range.label}`,
        subtitle: [
            `${state.clan?.name || ''} · ${range.span} · ${wars} wars, ${raids} raids`,
            shortDate(new Date(), { dateStyle: 'long' })
        ].join(' · '),
        note: empty ? `No war or raid data for ${range.label}.` : '',
        logoUrl: state.clan?.badgeUrls?.medium || '',
        headers: COLUMNS.map(c => c.label),
        rows: empty ? [] : list.map((m, i) => COLUMNS.map(c => String(c.get(m, i) ?? '')))
    };
}

function loadImage(url) {
    return new Promise(resolve => {
        if (!url) return resolve(null);
        const img = new Image();
        let settled = false;
        const done = value => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        img.crossOrigin = 'anonymous';
        img.onload = () => done(img);
        img.onerror = () => done(null);
        setTimeout(() => done(null), 4000);
        img.src = url;
    });
}

function measureColumns({ headers, rows }) {
    const ctx = document.createElement('canvas').getContext('2d');
    return headers.map((header, col) => {
        ctx.font = 'bold 14px ' + FONT;
        let widest = ctx.measureText(header).width;
        ctx.font = '14px ' + FONT;
        rows.forEach(row => { widest = Math.max(widest, ctx.measureText(row[col]).width); });
        return Math.ceil(widest) + L.cellPad * 2;
    });
}

function pickScale(height) {
    let scale = SCALE;
    while (height * scale > 16000 && scale > 1) scale--;
    return scale;
}

function drawHeader(ctx, report, width, logo) {
    const { pad } = L;
    let textX = pad;
    if (logo) {
        ctx.drawImage(logo, pad, pad, 56, 56);
        textX = pad + 70;
    }
    ctx.fillStyle = THEME.text;
    ctx.font = 'bold 24px ' + FONT;
    ctx.fillText(report.title, textX, pad + 26);
    ctx.fillStyle = THEME.sub;
    ctx.font = '14px ' + FONT;
    ctx.fillText(report.subtitle, textX, pad + 50);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(pad, pad + 66, width - pad * 2, 3);
}

function drawTable(ctx, { headers, rows }, widths, top) {
    const { pad, cellPad, rowH, headH } = L;
    const tableW = widths.reduce((a, b) => a + b, 0);
    const bodyTop = top + headH;
    const bottom = bodyTop + rows.length * rowH;

    const drawRow = (cells, y) => {
        let x = pad;
        cells.forEach((cell, col) => {
            ctx.fillText(cell, x + cellPad, y);
            x += widths[col];
        });
    };

    ctx.fillStyle = ACCENT;
    ctx.fillRect(pad, top, tableW, headH);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px ' + FONT;
    drawRow(headers, top + 22);

    ctx.font = '14px ' + FONT;
    rows.forEach((row, i) => {
        const y = bodyTop + i * rowH;
        if (i % 2) {
            ctx.fillStyle = THEME.zebra;
            ctx.fillRect(pad, y, tableW, rowH);
        }
        ctx.fillStyle = THEME.line;
        ctx.fillRect(pad, y + rowH - 1, tableW, 1);
        ctx.fillStyle = THEME.text;
        drawRow(row, y + 20);
    });

    ctx.fillStyle = THEME.border;
    let x = pad;
    widths.forEach((w, i) => {
        ctx.fillRect(x, bodyTop, 1, bottom - bodyTop);
        if (i > 0) ctx.fillRect(x, top, 1, headH);
        x += w;
    });
    ctx.fillRect(pad + tableW - 1, bodyTop, 1, bottom - bodyTop);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad + 0.5, top + 0.5, tableW - 1, bottom - top - 1);
}

async function createReportImage() {
    const report = makeMonthReport();
    const { pad, rowH, headH, headBlock, minWidth } = L;
    const logo = await loadImage(report.logoUrl);
    const widths = measureColumns(report);
    const width = Math.max(minWidth, widths.reduce((a, b) => a + b, 0) + pad * 2);
    const tableH = report.rows.length ? headH + report.rows.length * rowH : 60;
    const height = pad + headBlock + tableH + 12 + pad;
    const scale = pickScale(height);
    const canvas = document.createElement('canvas');

    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);
    drawHeader(ctx, report, width, logo);

    const top = pad + headBlock;
    if (report.rows.length) drawTable(ctx, report, widths, top);
    else {
        ctx.fillStyle = THEME.sub;
        ctx.font = '14px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText(report.note, width / 2, top + 30);
    }
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), title: report.title };
}

async function downloadReport() {
    try {
        const { dataUrl, title } = await createReportImage();
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'}.jpg`;
        link.click();
    } catch (err) {
        alert('Failed to create image: ' + err.message);
    }
}

// API STATUS
const muted = text => `<p class="text-[11px] text-[#8B8F98] py-1">${text}</p>`;

const liveLogHtml = () => {
    const rows = getLiveLog();
    const body = !LIVE_API_URL ? muted('Live API is disabled.')
        : !rows.length ? muted('No API requests yet.')
        : rows.map(row => `
            <div class="flex items-start gap-2 text-[11px] font-mono py-1 border-t border-[#2A2A2A] first:border-t-0">
                <span class="text-[#8B8F98] shrink-0">${escapeHtml(row.time)}</span>
                <span class="text-white shrink-0">${escapeHtml(row.path)}</span>
                <span class="${row.status === 'OK' ? 'text-green-400' : 'text-red-400'} break-all">${escapeHtml(row.status)}${row.note ? ' ' + escapeHtml(row.note) : ''}</span>
            </div>`).join('');

    return `
        <div class="mt-3">
            <h3 class="text-[11px] font-bold text-[#D4A72C] uppercase mb-1">Developer Log</h3>
            <div class="rounded-xl border border-[#2A2A2A] px-2 py-1">${body}</div>
        </div>`;
};

const apiHealth = () => {
    const logs = getLiveLog().filter(x => !/cwl/i.test(x.path || ''));
    const failed = logs.filter(x => x.status !== 'OK');
    return {
        failed: failed.length,
        total: logs.length,
        color: failed.length ? '#ef4444' : logs.length ? '#22c55e' : '#8B8F98',
        label: failed.length ? `${failed.length} API errors` : logs.length ? 'API healthy' : 'Not checked'
    };
};

// SETTINGS
export function renderSettings() {
    const page = document.getElementById('section-settings');
    if (!page) return;
    const logs = getLiveLog();
    const health = apiHealth();

    const row = (icon, title, note, attr) => `
        <button type="button" ${attr} class="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/5 active:bg-white/10">
            <span class="material-symbols-outlined text-[#D4A72C] text-xl">${icon}</span>
            <span class="flex-1 min-w-0">
                <span class="block text-xs font-semibold text-white">${title}</span>
                <span class="block text-[10px] text-[#8B8F98]">${note}</span>
            </span>
            <span class="material-symbols-outlined text-gray-500 text-lg">chevron_right</span>
        </button>`;

    page.innerHTML = pagePanel(`
        <div class="flex items-center gap-3 mb-4">
            ${backButton('data-settings-back')}
            <h2 class="text-lg font-bold text-white">Settings</h2>
        </div>
        <div class="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-[#222] text-xs">
            <span class="w-2 h-2 rounded-full" style="background:${health.color}"></span>
            <span class="text-gray-300">${health.label}</span>
            <span class="ml-auto text-[10px] text-gray-500">CWL excluded</span>
        </div>
        <div class="rounded-xl border border-[#2A2A2A] divide-y divide-[#2A2A2A] overflow-hidden">
            ${row('download', 'Monthly report', 'Download last month statistics', 'data-settings-report')}
            ${row('refresh', 'Refresh data', 'Update clan and battle statistics', 'data-settings-refresh')}
            ${row('terminal', 'API logs', `${logs.length} requests · ${health.label}`, 'data-settings-logs')}
            <div id="settingsLogPanel" class="hidden px-3 pb-3 max-h-64 overflow-y-auto">${liveLogHtml()}</div>
        </div>
        <p class="text-center text-[10px] text-gray-500 mt-4">Clan statistics · Live data may be delayed</p>
    `);

    page.onclick = e => {
        if (e.target.closest('[data-settings-report]')) downloadReport();
        else if (e.target.closest('[data-settings-refresh]')) document.getElementById('refreshBtn')?.click();
        else if (e.target.closest('[data-settings-logs]')) page.querySelector('#settingsLogPanel')?.classList.toggle('hidden');
    };
}

// CLAN HEADER
const renderLabel = label => `
    <div class="flex items-center gap-1 bg-[#252525] px-2 py-1 rounded-lg">
        <img src="${escapeHtml(label.iconUrls?.small || '')}" class="w-4 h-4" alt="">
        <span class="text-[10px] text-gray-400">${escapeHtml(label.name || '')}</span>
    </div>`;

const iconButton = (id, label, icon, extra = '') => `
    <button id="${id}" type="button" aria-label="${label}" title="${label}"
        class="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#242424] border border-[#363636] text-gray-200 hover:border-[#D4A72C]/50 hover:text-[#D4A72C] transition-all duration-200 active:scale-90 ${extra}">
        <span class="material-symbols-outlined text-[21px]">${icon}</span>
    </button>`;

function renderClanHeader(clan) {
    const el = document.getElementById('clanHeader');
    if (!el || !clan) return;
    const health = apiHealth();

    el.innerHTML = `
        <div class="flex items-center justify-between gap-3 mb-2">
            <div class="flex items-center gap-3 min-w-0">
                <img src="${escapeHtml(clan.badgeUrls?.medium || '')}" class="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-lg" style="filter:drop-shadow(0 0 12px rgba(212,167,44,.6))" alt="Clan Badge">
                <div class="min-w-0">
                    <h1 class="text-lg md:text-2xl font-bold text-white leading-tight truncate">${escapeHtml(clan.name || 'Unknown Clan')}</h1>
                    <p class="text-xs text-gray-400 font-mono">${escapeHtml(clan.tag || '')}</p>
                </div>
            </div>
            <div class="relative shrink-0 flex items-center gap-1.5">
                ${iconButton('refreshBtn', 'Refresh data', 'sync', 'disabled:opacity-60')}
                ${iconButton('settingsBtn', 'Settings', 'tune')}
                <span aria-label="${health.label}" title="${health.label} (CWL excluded)" class="absolute right-0 top-0 w-2.5 h-2.5 rounded-full border-2 border-[#121212] pointer-events-none" style="background:${health.color}"></span>
            </div>
        </div>
        <hr class="border-t border-[#2A2A2A]">`;
}

// MEMBERSHIP & WAR - SUPPORT 1 DAY
const renderStatsCard = () => {
    const war = getWarChartData();
    const history = Array.isArray(state.history) ? state.history : [];

    const members = history
        .filter(p => p?.date && Number.isFinite(Number(p.members)))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(-7)
        .map(p => ({ date: p.date, value: Number(p.members) }));

    if (!members.length && Number.isFinite(Number(state.clan?.members))) {
        members.push({
            date: new Date().toISOString().slice(0, 10),
            value: Number(state.clan.members)
        });
    }

    const wars = (war.points || [])
        .filter(p => p?.date && Number.isFinite(Number(p.value)))
        .slice(-7)
        .map(p => ({ date: p.date, value: Number(p.value) }));

    return renderCombinedChart({
        title: 'Membership & War',
        subtitle: `${members.length} membership records · ${wars.length} war records`,
        a: {
            name: 'Members',
            color: '#3B82F6',
            labelColor: '#93C5FD',
            points: members
        },
        b: {
            name: 'War Stars',
            color: '#EF4444',
            labelColor: '#FCA5A5',
            points: wars
        },
        stats: war.stats || [],
        note: war.total ? `${war.total} completed wars recorded` : 'Waiting for completed war data'
    });
};

// COMPACT ENTRY REQUIREMENTS
function renderEntryRequirements(clan) {
    const item = (label, value) => `
        <div class="flex items-center justify-between gap-2 min-w-0">
            <span class="text-[10px] text-gray-400 truncate">${label}</span>
            <span class="text-[10px] font-semibold text-white text-right">${escapeHtml(String(value))}</span>
        </div>`;

    const type = { open: 'Open', inviteOnly: 'Invite Only', closed: 'Closed' };
    const th = clan.requiredTownhallLevel ?? clan.requiredTownHallLevel;

    return `
        <div class="rounded-xl bg-[#1E1E1E] border border-[#2A2A2A] p-3">
            <div class="flex items-center gap-1.5 mb-2">
                <span class="material-symbols-outlined text-[#D4A72C] text-[16px]">how_to_reg</span>
                <h3 class="text-[11px] font-bold text-[#D4A72C] uppercase">Entry Requirements</h3>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                ${item('Trophies', fmt(clan.requiredTrophies ?? 0))}
                ${item('Town Hall', th ? `TH ${th}` : '-')}
                ${item('Builder Trophies', fmt(clan.requiredBuilderBaseTrophies ?? 0))}
                ${item('Clan Type', type[clan.type] || clan.type || '-')}
            </div>
        </div>`;
}

// COMPACT BATTLE BAR
const aboutStatBar = (title, wins, losses, draws = 0) => {
    const total = wins + losses + draws;
    const pct = n => total ? n / total * 100 : 0;

    return `
        <div class="flex items-center gap-3">
            <span class="text-[11px] font-bold text-white w-9 shrink-0">${title}</span>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between text-[9px] mb-1">
                    <span class="text-green-400">${wins}W</span>
                    <span class="text-gray-400">${draws}D</span>
                    <span class="text-red-400">${losses}L</span>
                </div>
                <div class="flex h-1.5 rounded-full overflow-hidden bg-[#333]">
                    <div class="bg-green-500" style="width:${pct(wins)}%"></div>
                    <div class="bg-gray-500" style="width:${pct(draws)}%"></div>
                    <div class="bg-red-500" style="width:${pct(losses)}%"></div>
                </div>
            </div>
            <span class="text-[10px] font-bold text-[#D4A72C] w-9 text-right">${total ? Math.round(pct(wins)) + '%' : '-'}</span>
        </div>`;
};

// WAR RESULTS
function getWarResults() {
    const wars = (state.wars || []).filter(isEndedWar);
    return wars.reduce((a, w) => {
        const c = w.clan || {};
        const o = w.opponent || {};
        const cs = c.stars ?? 0;
        const os = o.stars ?? 0;
        const cd = c.destructionPercentage ?? 0;
        const od = o.destructionPercentage ?? 0;

        if (cs > os || (cs === os && cd > od)) a.wins++;
        else if (cs < os || (cs === os && cd < od)) a.losses++;
        else a.draws++;
        return a;
    }, { wins: 0, losses: 0, draws: 0 });
}

// CWL RESULTS
function getCwlResults() {
    const cwl = state.cwl;
    if (!cwl) return null;

    const rounds = Array.isArray(cwl.rounds) ? cwl.rounds : [];
    const tag = state.clan?.tag;
    const result = { wins: 0, losses: 0, draws: 0 };

    for (const round of rounds) {
        const w = round.war || round;
        if (!isEndedWar(w) || !w.clan || !w.opponent) continue;

        const ours = w.clan.tag === tag ? w.clan : w.opponent.tag === tag ? w.opponent : null;
        const enemy = ours === w.clan ? w.opponent : w.clan;
        if (!ours) continue;

        const cs = ours.stars ?? 0;
        const os = enemy.stars ?? 0;
        const cd = ours.destructionPercentage ?? 0;
        const od = enemy.destructionPercentage ?? 0;

        if (cs > os || (cs === os && cd > od)) result.wins++;
        else if (cs < os || (cs === os && cd < od)) result.losses++;
        else result.draws++;
    }

    return result.wins + result.losses + result.draws ? result : null;
}

// COMPACT BATTLE STATISTICS
function renderBattleStatistics(clan) {
    const historical = [clan.warWins, clan.warLosses, clan.warTies].every(Number.isFinite);
    const war = historical
        ? { wins: clan.warWins, losses: clan.warLosses, draws: clan.warTies }
        : getWarResults();

    const cwl = getCwlResults();
    const raids = getRaidWeeks();

    const attacks = raids.reduce((n, r) =>
        n + (r.totalAttacks ?? (r.members || []).reduce((sum, m) => sum + (m.attacks || 0), 0)), 0
    );
    const districts = raids.reduce((n, r) => n + (r.enemyDistrictsDestroyed || 0), 0);

    return `
        <div class="rounded-xl bg-[#1E1E1E] border border-[#2A2A2A] p-3">
            <div class="flex items-center gap-1.5 mb-3">
                <span class="material-symbols-outlined text-[#D4A72C] text-[16px]">monitoring</span>
                <h3 class="text-[11px] font-bold text-[#D4A72C] uppercase">Battle Statistics</h3>
            </div>
            <div class="space-y-3">
                ${aboutStatBar('War', war.wins, war.losses, war.draws)}
                ${cwl ? aboutStatBar('CWL', cwl.wins, cwl.losses, cwl.draws) : `
                    <div class="flex items-center justify-between">
                        <span class="text-[11px] font-bold text-white">CWL</span>
                        <span class="text-[10px] text-gray-500">No results available</span>
                    </div>`}
            </div>
            <div class="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-[#2A2A2A]">
                <span class="text-[10px] font-semibold text-white">Raid</span>
                <div class="flex items-center gap-3 text-[10px]">
                    <span class="text-gray-400">Attacks <b class="text-white">${fmt(attacks)}</b></span>
                    <span class="text-gray-400">Districts <b class="text-[#D4A72C]">${fmt(districts)}</b></span>
                </div>
            </div>
        </div>`;
}

// ABOUT
export function renderAbout(clan) {
    const container = document.getElementById('section-about');
    if (!container || !clan) return;

    state.clan = clan;
    renderClanHeader(clan);

    container.innerHTML = `
        <div class="pt-2 pb-3 px-0 md:p-4 w-full flex flex-col gap-2.5">
            <div class="w-full overflow-hidden bg-[#1E1E1E] border border-[#2A2A2A] p-3 rounded-xl flex flex-col gap-2">
                <div class="pb-2 border-b border-[#2A2A2A]">
                    <div class="text-[11px] font-bold text-gray-200 mb-1">Description</div>
                    <div class="text-[11px] text-gray-300 break-words whitespace-pre-line">${escapeHtml(clan.description || '')}</div>
                </div>
                <div>
                    <div class="text-[11px] font-bold text-gray-200 mb-1.5">Clan Labels</div>
                    <div class="flex flex-wrap gap-1.5">${(clan.labels || []).map(renderLabel).join('')}</div>
                </div>
            </div>
            ${renderEntryRequirements(clan)}
            ${renderBattleStatistics(clan)}
            ${renderStatsCard()}
        </div>`;
}