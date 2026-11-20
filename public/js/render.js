import { escapeHtml, fmt, warStars, warDate, isEndedWar, pagePanel, backButton, getTheme, setTheme, renderMenuTabs, setMenuActive } from './constants.js';
import { state, getRaidWeeks, getCwlRounds } from './state.js';
import { getLiveLog, LIVE_API_URL } from './api.js';

// CONFIG
// Canvas drawing cannot use CSS classes, so it reads its colours from style.css.
// Reports keep their own colour accent (gold) in both themes.
const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const FONT = 'Arial, Helvetica, sans-serif';
const SCALE = 3;
const L = { pad: 24, cellPad: 12, rowH: 30, headH: 34, headBlock: 88, minWidth: 520 };
const THEME = {
    get bg() { return token('--report-bg'); },
    get text() { return token('--report-text'); },
    get sub() { return token('--report-sub'); },
    get line() { return token('--report-line'); },
    get zebra() { return token('--report-zebra'); },
    get border() { return token('--report-border'); },
    get accent() { return token('--report-accent'); },
    get onAccent() { return token('--report-on-accent'); },
};
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
    ctx.fillStyle = THEME.accent;
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

    ctx.fillStyle = THEME.accent;
    ctx.fillRect(pad, top, tableW, headH);
    ctx.fillStyle = THEME.onAccent;
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

async function createReportImage(report = makeMonthReport()) {
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

async function downloadReport(report = makeMonthReport()) {
    try {
        const { dataUrl, title } = await createReportImage(report);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'}.jpg`;
        link.click();
    } catch (err) {
        alert('Failed to create image: ' + err.message);
    }
}

// CWL REPORT (IMAGE)
// Ranks our members by attacks used (most first), then stars.
// Members without any attack end up at the bottom.
function collectCwlReport() {
    const rounds = getCwlRounds();
    if (!rounds.length) return null;

    const total = Math.max(state.cwl?.rounds?.length || 0, ...rounds.map(w => w.__round));
    const members = new Map();

    rounds.forEach(w => {
        const ended = isEndedWar(w);
        (w.clan?.members || []).forEach(m => {
            const row = members.get(m.tag) || {
                name: m.name, th: 0, cells: Array(total).fill(null),
                stars: 0, attacks: 0, played: 0, destruction: 0
            };
            const attack = (m.attacks || [])[0];

            row.th = m.townhallLevel ?? m.townHallLevel ?? row.th;
            row.name = m.name || row.name;

            let cell;
            if (attack) {
                cell = { type: 'attack', stars: attack.stars || 0 };
                row.attacks++;
                row.played++;
                row.stars += attack.stars || 0;
                row.destruction += attack.destructionPercentage || 0;
            } else if (ended) {
                cell = { type: 'missed' };
                row.played++;
            } else {
                cell = { type: 'pending' };
            }

            if (w.__round >= 1 && w.__round <= total) row.cells[w.__round - 1] = cell;
            members.set(m.tag, row);
        });
    });

    const list = [...members.values()].sort((a, b) =>
        b.attacks - a.attacks || b.stars - a.stars ||
        (b.attacks ? b.destruction / b.attacks : 0) - (a.attacks ? a.destruction / a.attacks : 0) ||
        String(a.name).localeCompare(String(b.name))
    );

    const record = getCwlResults();
    return {
        season: String(rounds[0].__season || state.cwl?.season || '').slice(0, 7),
        total,
        list,
        record: record ? `${record.wins}-${record.losses}-${record.draws}` : '-',
        stars: rounds.reduce((n, w) => n + (w.clan?.stars || 0), 0),
        done: rounds.filter(isEndedWar).length
    };
}

// Same table image as the Monthly report (white page, gold header, zebra rows)
function makeCwlReport() {
    const data = collectCwlReport();
    if (!data) return null;

    const cell = c => !c ? '-' : c.type === 'attack' ? String(c.stars) : c.type === 'missed' ? 'X' : '-';

    return {
        title: `CWL Season ${data.season}`,
        subtitle: [
            state.clan?.name || '',
            `${data.done}/${data.total} rounds`,
            `record ${data.record}`,
            `${data.stars} stars`,
            shortDate(new Date(), { dateStyle: 'long' })
        ].filter(Boolean).join(' · '),
        note: '',
        logoUrl: state.clan?.badgeUrls?.medium || '',
        headers: ['No', 'Name', 'TH', ...Array.from({ length: data.total }, (_, i) => 'R' + (i + 1)), 'Stars', 'Attacks'],
        rows: data.list.map((m, i) => [
            i + 1, m.name, m.th || '-', ...m.cells.map(cell), m.stars, `${m.attacks}/${m.played}`
        ].map(String))
    };
}

function downloadCwlReport() {
    const report = makeCwlReport();
    if (!report) return alert('No CWL data saved yet.');
    return downloadReport(report);
}

// API STATUS
const muted = text => `<p class="text-[11px] text-muted py-1">${text}</p>`;

const liveLogHtml = () => {
    const rows = getLiveLog();
    const body = !LIVE_API_URL ? muted('Live API is disabled.')
        : !rows.length ? muted('No API requests yet.')
        : rows.map(row => `
            <div class="flex items-start gap-2 text-[11px] font-mono py-1 border-t border-divider first:border-t-0">
                <span class="text-muted shrink-0">${escapeHtml(row.time)}</span>
                <span class="text-main shrink-0">${escapeHtml(row.path)}</span>
                <span class="${row.status === 'OK' ? 'text-good' : 'text-bad'} break-all">${escapeHtml(row.status)}${row.note ? ' ' + escapeHtml(row.note) : ''}</span>
            </div>`).join('');

    return `
        <div class="mt-3">
            <h3 class="text-[11px] font-bold text-accent uppercase mb-1">Developer Log</h3>
            <div class="rounded-xl border border-divider px-2 py-1">${body}</div>
        </div>`;
};

const apiHealth = () => {
    const logs = getLiveLog().filter(x => !/cwl/i.test(x.path || ''));
    const failed = logs.filter(x => x.status !== 'OK');
    return {
        failed: failed.length,
        total: logs.length,
        dot: failed.length ? 'bg-bad' : logs.length ? 'bg-good' : 'bg-subtle',
        label: failed.length ? `${failed.length} API errors` : logs.length ? 'API healthy' : 'Not checked'
    };
};

// SETTINGS
const DISPLAY_OPTIONS = [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }];

export function renderSettings() {
    const page = document.getElementById('section-settings');
    if (!page) return;
    const logs = getLiveLog();
    const health = apiHealth();

    const row = (icon, title, note, attr) => `
        <button type="button" ${attr} class="w-full flex items-center gap-3 px-3 py-3 text-left hover-bg-tint active-bg-tint-2">
            <span class="material-symbols-outlined text-accent text-xl">${icon}</span>
            <span class="flex-1 min-w-0">
                <span class="block text-xs font-semibold text-main">${title}</span>
                <span class="block text-[10px] text-muted">${note}</span>
            </span>
            <span class="material-symbols-outlined text-subtle text-lg">chevron_right</span>
        </button>`;

    page.innerHTML = pagePanel(`
        <div class="flex items-center gap-3 mb-4">
            ${backButton('data-settings-back')}
            <h2 class="text-lg font-bold text-main">Settings</h2>
        </div>
        <div class="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-surface text-xs">
            <span class="w-2 h-2 rounded-full ${health.dot}"></span>
            <span class="text-soft">${health.label}</span>
            <span class="ml-auto text-[10px] text-subtle">CWL excluded</span>
        </div>
        <div class="rounded-xl border border-divider bg-surface p-3 mb-3">
            <p class="text-xs font-semibold text-main">Display</p>
            <p class="text-[10px] text-muted mb-3">Light or dark appearance</p>
            <div class="[&>.switch-box]:mb-0">${renderMenuTabs('data-display', DISPLAY_OPTIONS, getTheme())}</div>
        </div>
        <div class="rounded-xl border border-divider divide-y divide-line overflow-hidden">
            ${row('download', 'Monthly report', 'Download last month statistics', 'data-settings-report')}
            ${row('leaderboard', 'CWL report', 'Download CWL attack ranking as image', 'data-settings-cwl')}
            ${row('terminal', 'API logs', `${logs.length} requests · ${health.label}`, 'data-settings-logs')}
            <div id="settingsLogPanel" class="hidden px-3 pb-3 max-h-64 overflow-y-auto">${liveLogHtml()}</div>
        </div>
        <p class="text-center text-[10px] text-subtle mt-4">Clan statistics · Live data may be delayed</p>
    `);

    page.onclick = e => {
        const display = e.target.closest('[data-display]');
        if (display) {
            setTheme(display.dataset.display);
            setMenuActive(display.closest('.switch-box'), 'data-display', display.dataset.display);
        }
        else if (e.target.closest('[data-settings-report]')) downloadReport();
        else if (e.target.closest('[data-settings-cwl]')) downloadCwlReport();
        else if (e.target.closest('[data-settings-logs]')) page.querySelector('#settingsLogPanel')?.classList.toggle('hidden');
    };
}

// CLAN HEADER
const renderLabel = label => `
    <span class="flex items-center gap-1 bg-surface-2 px-2 py-1 rounded-lg text-[10px] text-muted">
        <img src="${escapeHtml(label.iconUrls?.small || '')}" class="w-4 h-4" alt="">${escapeHtml(label.name || '')}
    </span>`;

const iconButton = (id, label, icon, extra = '') => `
    <button id="${id}" type="button" aria-label="${label}" title="${label}"
        class="relative flex items-center justify-center w-10 h-10 rounded-xl border border-line bg-surface text-muted hover-text-main active:scale-90 ${extra}">
        <span class="material-symbols-outlined text-[20px]">${icon}</span>
    </button>`;

function renderClanHeader(clan) {
    const el = document.getElementById('clanHeader');
    if (!el || !clan) return;
    const health = apiHealth();

    el.innerHTML = `
        <div class="flex items-center justify-between gap-3 pb-2.5">
            <h1 class="font-title flex-1 min-w-0 px-1 text-main leading-tight truncate">${escapeHtml(clan.name || 'Unknown Clan')}</h1>
            <div class="relative shrink-0 flex items-center gap-2">
                ${iconButton('refreshBtn', 'Refresh data', 'sync', 'disabled:opacity-60')}
                ${iconButton('settingsBtn', 'Settings', 'tune')}
                <span aria-label="${health.label}" title="${health.label} (CWL excluded)" class="absolute right-0 top-0 w-2.5 h-2.5 rounded-full border-2 border-page pointer-events-none ${health.dot}"></span>
            </div>
        </div>
        <hr class="border-t border-line">`;
}

// CWL RESULTS
// Rounds are normalized by getCwlRounds(): w.clan is always our clan.
function getCwlResults() {
    const result = { wins: 0, losses: 0, draws: 0 };

    for (const w of getCwlRounds()) {
        if (!isEndedWar(w) || !w.clan || !w.opponent) continue;

        const cs = w.clan.stars ?? 0;
        const os = w.opponent.stars ?? 0;
        const cd = w.clan.destructionPercentage ?? 0;
        const od = w.opponent.destructionPercentage ?? 0;

        if (cs > os || (cs === os && cd > od)) result.wins++;
        else if (cs < os || (cs === os && cd < od)) result.losses++;
        else result.draws++;
    }

    return result.wins + result.losses + result.draws ? result : null;
}

// HOME
// Banner image: put your own picture at public/assets/banner.jpg (any size, wide crops best).
// If the file is missing, the banner shows the clan badge instead.
const BANNER_IMAGE = 'assets/banner.jpg';
const CLAN_TYPES = { open: 'Open', inviteOnly: 'Invite only', closed: 'Closed' };

const bannerPill = (text, position) => text ? `
    <span class="absolute top-3 ${position} rounded-full bg-overlay px-3.5 py-1.5 text-[11px] font-bold text-main-90">${escapeHtml(String(text))}</span>` : '';

const renderBanner = clan => `
    <div class="relative h-40 rounded-3xl overflow-hidden bg-surface flex items-center justify-center">
        <img src="${escapeHtml(clan.badgeUrls?.large || clan.badgeUrls?.medium || '')}" class="h-24 object-contain opacity-90" alt="">
        <img src="${BANNER_IMAGE}" class="absolute inset-0 w-full h-full object-cover" alt="" onerror="this.remove()">
        ${bannerPill(CLAN_TYPES[clan.type] || clan.type, 'left-3')}
        ${bannerPill(clan.location?.name, 'right-3')}
    </div>`;

const infoRow = (icon, title, body) => `
    <div class="flex gap-3.5 py-4 first:pt-0 last:pb-0">
        <span class="shrink-0 flex w-9 h-9 items-center justify-center rounded-full bg-accent-soft">
            <span class="material-symbols-outlined text-accent text-[19px]">${icon}</span>
        </span>
        <div class="min-w-0 flex-1">
            <p class="text-[15px] font-semibold text-main leading-tight">${title}</p>
            <div class="mt-1 text-[13px] leading-snug text-muted break-words whitespace-pre-line">${body}</div>
        </div>
    </div>`;

const topPlayerLine = (m, i) => `
    <div class="flex items-center gap-2 py-0.5">
        <span class="w-4 text-[11px] font-bold text-accent">${i + 1}</span>
        <span class="flex-1 min-w-0 truncate text-soft">${escapeHtml(m.name)}</span>
        <span class="text-[12px] font-semibold tabular-nums text-main">${fmt(m.trophies)}</span>
    </div>`;

function infoRows(clan) {
    const rows = [];

    if (clan.description) rows.push(infoRow('info', 'About', escapeHtml(clan.description)));

    const labels = (clan.labels || []).map(renderLabel).join('');
    if (labels) rows.push(infoRow('sell', 'Labels', `<div class="flex flex-wrap gap-1.5 mt-1.5">${labels}</div>`));

    const capital = clan.clanCapital;
    if (capital?.capitalHallLevel) {
        const league = clan.capitalLeague?.name ? ` · ${escapeHtml(clan.capitalLeague.name)}` : '';
        rows.push(infoRow('castle', 'Clan Capital', `Capital Hall ${capital.capitalHallLevel}${league}`));
    }

    const top = [...(clan.memberList || [])].sort((a, b) => (b.trophies || 0) - (a.trophies || 0)).slice(0, 3);
    if (top.length) rows.push(infoRow('military_tech', 'Top players', top.map(topPlayerLine).join('')));

    if (clan.chatLanguage?.name) rows.push(infoRow('translate', 'Language', escapeHtml(clan.chatLanguage.name)));
    return rows.join('');
}

export function renderAbout(clan) {
    const container = document.getElementById('section-about');
    if (!container || !clan) return;

    state.clan = clan;
    renderClanHeader(clan);

    container.innerHTML = `
        <div class="pt-3 pb-3 px-0 md:p-4 w-full flex flex-col gap-3">
            ${renderBanner(clan)}
            <div class="rounded-3xl bg-surface px-5 py-5 divide-y divide-line">${infoRows(clan)}</div>
        </div>`;
}
