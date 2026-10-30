import { roleName, getTHImage, escapeHtml, fmt, renderCombinedChart, warStars, warDate, isEndedWar, pagePanel, backButton } from './constants.js';
import { state, getRaidWeeks } from './state.js';
import { getLiveLog, LIVE_API_URL } from './api.js';
import { getWarChartData } from './war.js';

const COLUMNS = [
    { label: 'No',           get: (m, i) => i + 1 },
    { label: 'Name',         get: (m) => m.name },
    { label: 'TH',           get: (m) => m.th ?? '-' },
    { label: 'Wars',         get: (m) => m.wars },
    { label: 'Attacks',      get: (m) => `${m.attacks}/${m.attackLimit}` },
    { label: 'Stars',        get: (m) => m.stars },
    { label: 'Destruction',  get: (m) => (m.attacks ? Math.round(m.destruction / m.attacks) + '%' : '-') },
    { label: 'Raid Atks',    get: (m) => `${m.raidAttacks}/${m.raidLimit}` },
    { label: 'Capital Gold', get: (m) => fmt(m.raidGold) },
];

const ACCENT = '#d4a017';
const FONT = 'Arial, Helvetica, sans-serif';
const SCALE = 3;
const L = { pad: 24, cellPad: 12, rowH: 30, headH: 34, headBlock: 88, minWidth: 520 };
const THEME = { bg: '#ffffff', text: '#111111', sub: '#555555', line: '#c4c4c4', zebra: '#f5f5f5', border: '#d1d5db' };

const shortDate = (d, opts) => d.toLocaleDateString('en-US', opts);

function lastMonthRange(now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(end.getTime() - 86400000);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const day = { day: 'numeric', month: 'short' };

    return {
        from: iso(start),
        to: iso(end),
        label: shortDate(start, { month: 'long', year: 'numeric' }),
        span: `${shortDate(start, day)} - ${shortDate(lastDay, day)}`,
    };
}

function collectMonthStats({ from, to }) {
    const inRange = (rec) => { const d = warDate(rec); return d >= from && d < to; };
    const wars = state.wars.filter((w) => isEndedWar(w) && inRange(w));
    const raids = getRaidWeeks().filter(inRange);

    const rows = new Map();
    const row = (tag, name, th) => {
        if (!rows.has(tag)) {
            rows.set(tag, { name, th, wars: 0, attacks: 0, attackLimit: 0, stars: 0, destruction: 0, raidAttacks: 0, raidLimit: 0, raidGold: 0 });
        }
        const r = rows.get(tag);
        if (th && !r.th) r.th = th;
        return r;
    };

    (state.clan?.memberList || []).forEach((m) => row(m.tag, m.name, m.townHallLevel));

    wars.forEach((w) => (w.clan?.members || []).forEach((m) => {
        const r = row(m.tag, m.name, m.townhallLevel ?? m.townHallLevel);
        r.wars += 1;
        r.attackLimit += w.attacksPerMember || 2;
        r.attacks += (m.attacks || []).length;
        r.stars += warStars(m);
        r.destruction += (m.attacks || []).reduce((n, a) => n + (a.destructionPercentage || 0), 0);
    }));

    raids.forEach((w) => (w.members || []).forEach((m) => {
        const r = row(m.tag, m.name);
        r.raidAttacks += m.attacks || 0;
        r.raidLimit += (m.attackLimit || 0) + (m.bonusAttackLimit || 0);
        r.raidGold += m.capitalResourcesLooted || 0;
    }));

    const list = [...rows.values()].sort((a, b) =>
        b.stars - a.stars || b.raidGold - a.raidGold || String(a.name).localeCompare(String(b.name)));
    return { list, wars: wars.length, raids: raids.length };
}

function makeMonthReport() {
    const range = lastMonthRange();
    const { list, wars, raids } = collectMonthStats(range);
    const empty = !wars && !raids;

    return {
        title: `Statistics ${range.label}`,
        subtitle: [`${state.clan?.name || ''} · ${range.span} · ${wars} wars, ${raids} raids`, shortDate(new Date(), { dateStyle: 'long' })].join(' · '),
        note: empty ? `No war or raid data for ${range.label}.` : '',
        logoUrl: state.clan?.badgeUrls?.medium || '',
        headers: COLUMNS.map((c) => c.label),
        rows: empty ? [] : list.map((m, i) => COLUMNS.map((c) => String(c.get(m, i) ?? ''))),
    };
}

function loadImage(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 4000);
        img.src = url;
    });
}

function measureColumns({ headers, rows }) {
    const ctx = document.createElement('canvas').getContext('2d');

    return headers.map((header, col) => {
        ctx.font = 'bold 14px ' + FONT;
        let widest = ctx.measureText(header).width;
        ctx.font = '14px ' + FONT;
        rows.forEach((row) => { widest = Math.max(widest, ctx.measureText(row[col]).width); });
        return Math.ceil(widest) + L.cellPad * 2;
    });
}

function pickScale(height) {
    let scale = SCALE;
    while (height * scale > 16000 && scale > 1) scale -= 1;
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
        if (i % 2 === 1) {
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
    if (report.rows.length) {
        drawTable(ctx, report, widths, top);
    } else {
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

const reportButtonHtml = () => `
    <button type="button" data-report
            class="w-full flex items-center gap-3 px-3 py-3 bg-[#1E1E1E] border border-[#3A3A3A] rounded-xl
                   text-left active:scale-[0.99] transition-transform">
        <span class="material-symbols-outlined text-[26px] text-[#D4A72C]">calendar_month</span>
        <div class="leading-tight">
            <p class="text-sm font-bold text-white">Last Month Statistics</p>
            <p class="text-[10px] text-[#8B8F98]">All members · ${lastMonthRange().label}</p>
        </div>
    </button>
`;

const muted = (text) => `<p class="text-[11px] text-[#8B8F98] py-1">${text}</p>`;

const liveLogHtml = () => {
    const rows = getLiveLog();
    const body = !LIVE_API_URL ? muted('Live API nonaktif (LIVE_API_URL kosong).')
        : !rows.length ? muted('Belum ada panggilan.')
        : rows.map((row) => `
            <div class="flex items-start gap-2 text-[11px] font-mono py-1 border-t border-[#2A2A2A] first:border-t-0">
                <span class="text-[#8B8F98] shrink-0">${escapeHtml(row.time)}</span>
                <span class="text-white shrink-0">${escapeHtml(row.path)}</span>
                <span class="${row.status === 'OK' ? 'text-green-400' : 'text-red-400'} break-all">${escapeHtml(row.status)}${row.note ? ' ' + escapeHtml(row.note) : ''}</span>
            </div>`).join('');

    return `
        <div class="mt-4">
            <h3 class="text-[11px] font-bold text-[#D4A72C] uppercase mb-1">developer log</h3>
            <div class="rounded-xl border border-[#2A2A2A] px-2 py-1">${body}</div>
        </div>`;
};

export function renderSettings() {
    const page = document.getElementById('section-settings');
    if (!page) return;

    page.innerHTML = pagePanel(`
        <div class="flex items-center gap-3 mb-3">
            ${backButton('data-settings-back')}
            <h2 class="medieval text-lg font-bold text-white uppercase">Settings</h2>
        </div>
        <div class="flex flex-col gap-2">${reportButtonHtml()}</div>
        ${liveLogHtml()}
    `);

    page.onclick = (e) => {
        if (e.target.closest('[data-report]')) downloadReport();
    };
}

const renderLabel = (label) => `
    <div class="flex items-center gap-1 bg-[#252525] px-2 py-1 rounded-lg">
        <img src="${label.iconUrls?.small || ''}" class="w-4 h-4" alt="">
        <span class="text-[10px] text-gray-400">${label.name}</span>
    </div>
`;

const iconButton = (id, label, icon, extra = '') => `
    <button id="${id}" type="button" aria-label="${label}"
            class="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20
                   text-gray-200 transition-all duration-300 active:scale-95 ${extra}">
        <span class="material-symbols-outlined text-[22px]">${icon}</span>
    </button>
`;

function renderClanHeader(clan) {
    const el = document.getElementById('clanHeader');
    if (!el || !clan) return;

    el.innerHTML = `
        <div class="flex items-center justify-between gap-3 mb-2">
            <div class="flex items-center gap-3 min-w-0">
                <img src="${clan.badgeUrls?.medium || ''}"
                     class="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-lg" style="filter: drop-shadow(0 0 12px rgba(212, 167, 44, 0.6));" alt="Clan Badge">
                <div class="min-w-0">
                    <h1 class="text-lg md:text-2xl font-bold text-white leading-tight truncate">${escapeHtml(clan.name || 'Unknown Clan')}</h1>
                    <p class="text-xs text-gray-400 font-mono">${escapeHtml(clan.tag || '')}</p>
                </div>
            </div>
            <div class="shrink-0 flex items-center gap-1.5">
                ${iconButton('refreshBtn', 'Refresh data', 'refresh', 'disabled:opacity-60')}
                ${iconButton('settingsBtn', 'Settings', 'settings', 'hover:rotate-45')}
            </div>
        </div>
        <hr class="border-t border-[#2A2A2A]">
    `;
}

const renderRecordTile = (label, value, color) => `
    <div class="rounded-lg bg-[#252525] px-2 py-2 text-center leading-tight">
        <p class="text-[8px] font-semibold tracking-wide uppercase text-[#8B8F98]">${label}</p>
        <p class="text-sm font-bold mt-0.5 ${color}">${value == null ? '-' : fmt(value)}</p>
    </div>
`;

const renderPersonRow = (m, index, value, label, color = 'text-[#D4A72C]') => `
    <div class="flex items-center gap-3 px-3 py-1.5 ${index > 0 ? 'border-t border-[#2A2A2A]' : ''}">
        <img src="${getTHImage(m.townHallLevel)}" class="w-9 h-9 shrink-0 object-contain"
             alt="TH${m.townHallLevel}" onerror="this.style.visibility='hidden'">
        <div class="min-w-0 flex-1 leading-tight">
            <p class="text-[13px] font-bold text-white truncate">${escapeHtml(m.name)}</p>
            <p class="text-[9px] font-semibold tracking-wide uppercase text-[#D4A72C]">${roleName(m.role)} · TH${m.townHallLevel}</p>
        </div>
        ${value != null ? `
        <div class="shrink-0 text-right leading-tight">
            <p class="text-[13px] font-bold ${color}">${value}</p>
            <p class="text-[7px] tracking-wide uppercase text-[#6B7280]">${label}</p>
        </div>` : ''}
    </div>
`;

const renderStatsCard = () => {
    const war = getWarChartData();
    return renderCombinedChart({
        title: 'Membership & War',
        subtitle: 'Anggota per hari · bintang per war',
        a: { name: 'Anggota', color: '#3B82F6', labelColor: '#93C5FD',
             points: state.history.slice(-7).map((p) => ({ date: p.date, value: p.members })) },
        b: { name: 'War (bintang)', color: '#EF4444', labelColor: '#FCA5A5', points: war.points },
        stats: war.stats,
        note: war.total ? `Ringkasan ${war.total} war selesai` : '',
    });
};

const renderLeadSection = (title, rows) => rows ? `
    <div>
        <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide mb-2">${title}</h4>
        <div class="rounded-xl overflow-hidden border border-[#2A2A2A]">${rows}</div>
    </div>
` : '';

const GOLD = 'text-[#D4A72C]';

const RANKING = [
    { score: (m) => m.donations || 0, value: (m) => m.donations, label: 'Donated' },
    { score: (m) => m.trophies || 0, value: (m) => m.trophies, label: 'Trophies', color: GOLD },
    { score: (m) => (m.townHallLevel || 0) * 100000 + (m.trophies || 0), value: (m) => `TH${m.townHallLevel}`, label: 'Town Hall', color: GOLD },
    { score: (m) => m.expLevel || 0, value: (m) => m.expLevel ?? '-', label: 'XP', color: GOLD },
];

export function renderAbout(clan) {
    const container = document.getElementById('section-about');
    if (!container || !clan) return;
    state.clan = clan;
    renderClanHeader(clan);

    const list = clan.memberList || [];
    const topBy = (score) => [...list].sort((a, b) => score(b) - score(a))[0];

    const rankingHtml = RANKING.map(({ score, value, label, color }, i) => {
        const m = topBy(score);
        return m ? renderPersonRow(m, i, value(m), label, color) : '';
    }).join('');

    container.innerHTML = `
        <div class="pt-4 pb-3 px-0 md:p-5 w-full flex flex-col gap-4">
            <div class="w-full overflow-hidden bg-[#1E1E1E] border border-[#2A2A2A] p-3 md:p-6 rounded-xl flex flex-col gap-3">
                <div class="pb-3 border-b border-[#2A2A2A]">
                    <div class="text-sm font-bold text-gray-200 mb-1">Description</div>
                    <div class="text-xs md:text-sm text-gray-300 break-words whitespace-pre-line m-0">${clan.description || ''}</div>
                </div>

                <div class="pb-3 border-b border-[#2A2A2A]">
                    <div class="text-sm font-bold text-gray-200 mb-1.5">Clan Labels</div>
                    <div class="flex flex-wrap gap-1.5">${(clan.labels || []).map(renderLabel).join('')}</div>
                </div>

                <div>
                    <div class="text-sm font-bold text-gray-200 mb-1.5">War Record</div>
                    <div class="grid grid-cols-3 gap-2">
                        ${renderRecordTile('Victories', clan.warWins, 'text-green-500')}
                        ${renderRecordTile('Defeats', clan.warLosses, 'text-red-500')}
                        ${renderRecordTile('Draws', clan.warTies, 'text-gray-400')}
                    </div>
                </div>
            </div>

            <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3 flex flex-col gap-4">
                ${renderLeadSection('Ranking', rankingHtml)}
            </div>
            ${renderStatsCard()}
        </div>
    `;
}
