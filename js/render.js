import { roleMap, getTHImage, escapeHtml } from './constants.js';
import { state } from './state.js';
import { fmt, dayLabel, renderAreaChart } from './chart.js';
import { MEMBER_SORTS } from './members.js';

// Theme mode: dark only

// ── 3. Report config ──
const BASE_STYLE = {
    Footer: '',
    Accent: '#d4a017',
    Theme: 'light',
    Scale: 3,
    Format: 'jpeg',
    Logo: true,
    Date: true,
    Zebra: true,
};

const REPORT_CONFIG = {
    war: {
        ...BASE_STYLE,
        Title: 'War Report',
        Cols: ['no', 'name', 'th', 'attacks', 'stars', 'destruction', 'defense'],
    },
    members: {
        ...BASE_STYLE,
        Title: 'Clan Members List',
        Sort: 'rank',
        Cols: ['no', 'name', 'role', 'th', 'trophies', 'donations', 'received'],
    },
};

// ── 4. Table columns & sorting ──
const MEMBER_COLS = [
    { id: 'no',        label: 'No',       get: (m, i) => i + 1 },
    { id: 'name',      label: 'Name',     get: (m) => m.name },
    { id: 'tag',       label: 'Tag',      get: (m) => m.tag },
    { id: 'role',      label: 'Role',     get: (m) => roleMap[m.role] || m.role || '-' },
    { id: 'th',        label: 'TH',       get: (m) => m.townHallLevel ?? '-' },
    { id: 'trophies',  label: 'Trophies', get: (m) => m.trophies ?? '-' },
    { id: 'donations', label: 'Donated',  get: (m) => m.donations ?? '-' },
    { id: 'received',  label: 'Received', get: (m) => m.donationsReceived ?? '-' },
];

function totalStars(member) {
    return (member.attacks || []).reduce((sum, a) => sum + (a.stars || 0), 0);
}

function averageDestruction(member) {
    const attacks = member.attacks || [];
    if (attacks.length === 0) return '-';
    const total = attacks.reduce((sum, a) => sum + (a.destructionPercentage || 0), 0);
    return Math.round(total / attacks.length) + '%';
}

const attacksUsed = (member) => `${member.attacks?.length || 0}/${state.war?.attacksPerMember || 2}`;
const bestDefense = (member) => member.bestOpponentAttack ? member.bestOpponentAttack.stars : '-';

const WAR_COLS = [
    { id: 'no',          label: 'No',          get: (m, i) => i + 1 },
    { id: 'name',        label: 'Name',        get: (m) => m.name },
    { id: 'th',          label: 'TH',          get: (m) => m.townhallLevel ?? '-' },
    { id: 'attacks',     label: 'Attacks',     get: attacksUsed },
    { id: 'stars',       label: 'Stars',       get: totalStars },
    { id: 'destruction', label: 'Destruction', get: averageDestruction },
    { id: 'defense',     label: 'Defense',     get: bestDefense },
];


// ── 5. Building report content ──
function clanLabel() {
    if (!state.clan?.name) return '';
    return state.clan.tag ? `${state.clan.name} (${state.clan.tag})` : state.clan.name;
}

function safeColor(color) {
    return /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#d4a017';
}

function makeReport({ config, allCols, items, groups, subtitle, emptyNote }) {
    const cols = allCols.filter((c) => config.Cols.includes(c.id));
    const rowsOf = (list) => list.map((item, i) => cols.map((c) => String(c.get(item, i) ?? '')));
    // Sections (title + rows); a report without sections is one untitled table
    const sections = (groups || [{ title: '', items }])
        .filter((g) => g.items.length)
        .map((g) => ({ title: g.title, rows: rowsOf(g.items) }));
    const allItems = groups ? groups.flatMap((g) => g.items) : items;
    const today = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });

    return {
        config,
        title: config.Title,
        subtitle,
        note: allItems.length ? '' : emptyNote,
        accent: safeColor(config.Accent),
        date: config.Date ? today : '',
        logoUrl: config.Logo ? (state.clan?.badgeUrls?.medium || '') : '',
        headers: cols.map((c) => c.label),
        sections,
        rows: sections.flatMap((s) => s.rows), // all rows together, used to size the columns
    };
}

function makeWarReport() {
    const members = [...(state.war?.clan?.members || [])].sort((a, b) =>
        (b.attacks?.length || 0) - (a.attacks?.length || 0)
        || totalStars(b) - totalStars(a)
        || (a.mapPosition || 0) - (b.mapPosition || 0));

    const clanName = state.war?.clan?.name || state.clan?.name || '';
    const enemyName = state.war?.opponent?.name || '';

    // Same split as the War page: who attacked, then who did not
    const attacked = members.filter((m) => (m.attacks?.length || 0) > 0);
    const idle = members.filter((m) => !(m.attacks?.length || 0))
        .sort((a, b) => (a.mapPosition || 0) - (b.mapPosition || 0));

    return makeReport({
        config: REPORT_CONFIG.war,
        allCols: WAR_COLS,
        groups: [
            { title: `Attacked (${attacked.length})`, items: attacked },
            { title: `Not attacked (${idle.length})`, items: idle },
        ],
        subtitle: enemyName ? `${clanName} vs ${enemyName}` : clanName,
        emptyNote: state.war ? 'No members in this war data.' : 'War data is not available yet.',
    });
}

function makeMembersReport() {
    const config = REPORT_CONFIG.members;
    const members = [...(state.clan?.memberList || [])].sort(MEMBER_SORTS[config.Sort] || MEMBER_SORTS.rank);

    return makeReport({
        config,
        allCols: MEMBER_COLS,
        items: members,
        subtitle: clanLabel(),
        emptyNote: 'Member data is not available yet.',
    });
}

// ── 6. Drawing the report as an image ──
const FONT = 'Arial, Helvetica, sans-serif';

const LAYOUT = {
    pad: 24,
    cellPad: 12,
    rowH: 30,
    headH: 34,
    headBlock: 88,
    minWidth: 520,
    titleH: 30,
    gap: 14,
};

const THEMES = {
    light: { bg: '#ffffff', text: '#111111', sub: '#555555', line: '#c4c4c4', zebra: '#f5f5f5', border: '#d1d5db' },
    dark:  { bg: '#121212', text: '#f2f2f2', sub: '#a0a0a0', line: '#3d3d3d', zebra: '#1b1b1b', border: '#3A3A3A' },
};

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

function measureColumns(report) {
    const ctx = document.createElement('canvas').getContext('2d');

    return report.headers.map((header, col) => {
        ctx.font = 'bold 14px ' + FONT;
        let widest = ctx.measureText(header).width;

        ctx.font = '14px ' + FONT;
        report.rows.forEach((row) => {
            widest = Math.max(widest, ctx.measureText(row[col]).width);
        });

        return Math.ceil(widest) + LAYOUT.cellPad * 2;
    });
}

function pickScale(wanted, height) {
    let scale = Math.min(4, Math.max(1, Number(wanted) || 2));
    while (height * scale > 16000 && scale > 1) scale -= 1;
    return scale;
}

function drawHeader(ctx, report, width, logo, theme) {
    const { pad } = LAYOUT;
    let textX = pad;

    if (logo) {
        ctx.drawImage(logo, pad, pad, 56, 56);
        textX = pad + 70;
    }

    ctx.fillStyle = theme.text;
    ctx.font = 'bold 24px ' + FONT;
    ctx.fillText(report.title, textX, pad + 26);

    const parts = [report.subtitle, report.date].filter(Boolean);
    ctx.fillStyle = theme.sub;
    ctx.font = '14px ' + FONT;
    ctx.fillText(parts.join(' · '), textX, pad + 50);

    ctx.fillStyle = report.accent;
    ctx.fillRect(pad, pad + 66, width - pad * 2, 3);
}

function drawTable(ctx, report, widths, startY, theme) {
    const { pad, cellPad, rowH, headH } = LAYOUT;
    const tableW = widths.reduce((a, b) => a + b, 0);
    let y = startY;

    ctx.fillStyle = report.accent;
    ctx.fillRect(pad, y, tableW, headH);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px ' + FONT;
    let x = pad;
    report.headers.forEach((header, col) => {
        ctx.fillText(header, x + cellPad, y + 22);
        x += widths[col];
    });
    y += headH;

    ctx.font = '14px ' + FONT;
    report.rows.forEach((row, rowIndex) => {
        if (report.config.Zebra && rowIndex % 2 === 1) {
            ctx.fillStyle = theme.zebra;
            ctx.fillRect(pad, y, tableW, rowH);
        }

        ctx.fillStyle = theme.line;
        ctx.fillRect(pad, y + rowH - 1, tableW, 1);

        ctx.fillStyle = theme.text;
        let cellX = pad;
        row.forEach((cell, col) => {
            ctx.fillText(cell, cellX + cellPad, y + 20);
            cellX += widths[col];
        });

        y += rowH;
    });

    drawTableLines(ctx, widths, startY, y, theme);
    return y;
}

function drawTableLines(ctx, widths, topY, bottomY, theme) {
    const { pad, headH } = LAYOUT;
    const tableW = widths.reduce((a, b) => a + b, 0);
    const bodyTop = topY + headH;

    ctx.fillStyle = theme.border;
    let x = pad;
    widths.forEach((w) => {
        ctx.fillRect(x, bodyTop, 1, bottomY - bodyTop);
        x += w;
    });
    ctx.fillRect(pad + tableW - 1, bodyTop, 1, bottomY - bodyTop);

    x = pad;
    widths.forEach((w, i) => {
        if (i > 0) ctx.fillRect(x, topY, 1, headH);
        x += w;
    });

    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad + 0.5, topY + 0.5, tableW - 1, bottomY - topY - 1);
}

function drawSectionTitle(ctx, title, y, theme) {
    ctx.fillStyle = theme.text;
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillText(title, LAYOUT.pad, y + 20);
}

function drawCenteredText(ctx, text, width, y, font, color) {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y);
    ctx.textAlign = 'left';
}

const REPORTS = {
    members: makeMembersReport,
    war: makeWarReport,
};

async function createReportImage(type) {
    const report = (REPORTS[type] || makeMembersReport)();
    const { config } = report;
    const theme = THEMES[config.Theme] || THEMES.light;
    const { pad, rowH, headH, headBlock, minWidth } = LAYOUT;

    const logo = await loadImage(report.logoUrl);
    const widths = measureColumns(report);

    const tableW = widths.reduce((a, b) => a + b, 0);
    const width = Math.max(minWidth, tableW + pad * 2);
    const { titleH, gap } = LAYOUT;
    const tableH = report.rows.length
        ? report.sections.reduce((sum, s) => sum + (s.title ? titleH : 0) + headH + s.rows.length * rowH + gap, 0) - gap
        : 60;
    const footerH = config.Footer ? 44 : 12;
    const height = pad + headBlock + tableH + footerH + pad;
    const scale = pickScale(config.Scale, height);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);

    drawHeader(ctx, report, width, logo, theme);

    let y = pad + headBlock;
    if (report.rows.length) {
        report.sections.forEach((section, i) => {
            if (i > 0) y += gap;
            if (section.title) {
                drawSectionTitle(ctx, section.title, y, theme);
                y += titleH;
            }
            y = drawTable(ctx, { ...report, rows: section.rows }, widths, y, theme);
        });
    } else {
        drawCenteredText(ctx, report.note, width, y + 30, '14px ' + FONT, theme.sub);
        y += 60;
    }

    if (config.Footer) {
        drawCenteredText(ctx, config.Footer, width, y + 28, '12px ' + FONT, theme.sub);
    }

    const mime = config.Format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return { dataUrl: canvas.toDataURL(mime, 0.92), mime, title: report.title };
}

// ── 7. Settings modal ──
function makeFileName(title) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug || 'report';
}

async function generateReport(type) {
    try {
        const { dataUrl, mime, title } = await createReportImage(type);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${makeFileName(title)}.${mime === 'image/jpeg' ? 'jpg' : 'png'}`;
        link.click();
    } catch (err) {
        alert('Failed to create image: ' + err.message);
    }
}

const SETTINGS_REPORTS = [
    { type: 'members', icon: 'groups', title: 'Members Report', desc: 'Creation Pdf War' },
    { type: 'war',     icon: 'swords', title: 'War Report',     desc: 'Creation Pdf War' },
];

const reportButtonHtml = ({ type, icon, title, desc }) => `
    <button type="button" data-report="${type}"
            class="w-full flex items-center gap-3 px-3 py-3 bg-[#1E1E1E] border border-[#3A3A3A] rounded-xl
                   text-left active:scale-[0.99] transition-transform">
        <span class="material-symbols-outlined text-[26px] text-[#D4A72C]">${icon}</span>
        <div class="leading-tight">
            <p class="text-sm font-bold text-white">${title}</p>
            <p class="text-[10px] text-[#8B8F98]">${desc}</p>
        </div>
    </button>
`;

// Settings page (same look as the War detail page). Back button is handled in app.js
export function renderSettings() {
    const page = document.getElementById('section-settings');
    if (!page) return;

    page.innerHTML = `
        <div class="px-0 py-3 pb-28 w-full">
            <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-2xl p-3">
                <div class="flex items-center gap-3 mb-3">
                    <button type="button" data-settings-back aria-label="Back"
                            class="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white
                                   flex items-center justify-center active:scale-90 transition-all">
                        <span class="material-symbols-outlined text-[20px]">arrow_back</span>
                    </button>
                    <h2 class="medieval text-lg font-bold text-white uppercase">Settings</h2>
                </div>
                <div class="flex flex-col gap-2">${SETTINGS_REPORTS.map(reportButtonHtml).join('')}</div>
            </div>
        </div>
    `;

    page.onclick = (e) => {
        const button = e.target.closest('[data-report]');
        if (button) generateReport(button.dataset.report);
    };
}

// ── 8. About page ──
const roleName = (role) => roleMap[role] || role;

const renderLabel = (label) => `
    <div class="flex items-center gap-1 bg-[#252525] px-2 py-1 rounded-lg">
        <img src="${label.iconUrls?.small || ''}" class="w-4 h-4" alt="">
        <span class="text-[10px] text-gray-400">${label.name}</span>
    </div>
`;

const renderSettingsButton = () => `
    <button
        id="settingsBtn"
        type="button"
        aria-label="Settings"
        class="flex items-center justify-center
               w-9 h-9 rounded-full bg-white/10 hover:bg-white/20
               text-gray-200 transition-all duration-300
               hover:rotate-45 active:scale-95"
    >
        <span class="material-symbols-outlined text-[22px]">settings</span>
    </button>
`;



function renderClanHeader(clan) {
    const el = document.getElementById('clanHeader');
    if (!el || !clan) return;
    el.innerHTML = `
        <div class="flex items-center justify-between gap-3 mb-2">
            <div class="flex items-center gap-3 min-w-0">
                <img src="${clan.badgeUrls?.medium || ''}"
                     class="w-10 h-10 md:w-12 md:h-12 shrink-0" alt="Clan Badge">
                <div class="min-w-0">
                    <h1 class="text-lg md:text-2xl font-bold text-white leading-tight truncate">
                        ${clan.name || 'Unknown Clan'}
                    </h1>
                    <p class="text-xs text-gray-400 font-mono">${clan.tag || ''}</p>
                </div>
            </div>
            <div class="shrink-0 flex items-center gap-1.5">
                ${renderSettingsButton()}
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
            <p class="text-[9px] font-semibold tracking-wide uppercase text-[#D4A72C]">
                ${roleName(m.role)} · TH${m.townHallLevel}
            </p>
        </div>
        ${value != null ? `
        <div class="shrink-0 text-right leading-tight">
            <p class="text-[13px] font-bold ${color}">${value}</p>
            <p class="text-[7px] tracking-wide uppercase text-[#6B7280]">${label}</p>
        </div>` : ''}
    </div>
`;

// Capital Gold from the latest raid weekend
const renderCapitalCard = () => {
    const loot = state.raid?.capitalTotalLoot;
    if (loot == null) return '';

    const meta = `${fmt(state.raid.raidsCompleted)} raids · ${fmt(state.raid.totalAttacks)} attacks`;

    return `
        <div id="raidCard" role="button" tabindex="0"
             class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3 cursor-pointer active:scale-[0.99] transition-transform">
            <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide mb-2">Capital Gold</h4>
            <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-[30px] text-[#D4A72C]">savings</span>
                <div class="leading-tight">
                    <p class="text-xl font-bold text-[#D4A72C]">${fmt(loot)}</p>
                    <p class="text-[10px] text-[#8B8F98]">Latest raid weekend · ${meta}</p>
                </div>
            </div>
        </div>`;
};
const renderMembershipCard = () => renderAreaChart({
    title: 'Membership',
    subtitle: 'Members per day',
    points: state.history.map((p) => ({ label: dayLabel(p.date), value: p.members })),
    note: state.history.length > 1 ? `Last ${state.history.length} days` : '',
});

const renderLeadSection = (title, rows) => rows ? `
    <div>
        <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide mb-2">${title}</h4>
        <div class="rounded-xl overflow-hidden border border-[#2A2A2A]">${rows}</div>
    </div>
` : '';

export function renderAbout(clan) {
    const container = document.getElementById('section-about');
    if (!container || !clan) return;
    state.clan = clan;
    renderClanHeader(clan);

    const labels = (clan.labels || []).map(renderLabel).join('');

    const list = clan.memberList || [];
    const topBy = (score) => [...list].sort((a, b) => score(b) - score(a))[0];
    const gold = 'text-[#D4A72C]';

    const ranking = [
        { score: (m) => m.donations || 0, value: (m) => m.donations, label: 'Donated' },
        { score: (m) => m.trophies || 0, value: (m) => m.trophies, label: 'Trophies', color: gold },
        { score: (m) => (m.townHallLevel || 0) * 100000 + (m.trophies || 0), value: (m) => `TH${m.townHallLevel}`,
          label: 'Town Hall', color: gold },
        { score: (m) => m.expLevel || 0, value: (m) => m.expLevel ?? '-', label: 'XP', color: gold },
    ];

    const rankingHtml = ranking.map(({ score, value, label, color }, i) => {
        const m = topBy(score);
        return m ? renderPersonRow(m, i, value(m), label, color) : '';
    }).join('');

    container.innerHTML = `
        <div class="pt-4 pb-3 px-0 md:p-5 w-full flex flex-col gap-4">
            <div class="w-full overflow-hidden
                        bg-[#1E1E1E] border border-[#2A2A2A]
                        p-3 md:p-6 rounded-xl flex flex-col gap-3">

                <div class="pb-3 border-b border-[#2A2A2A]">
                    <div class="text-sm font-bold text-gray-200 mb-1">Description</div>
                    <div class="text-xs md:text-sm text-gray-300 break-words whitespace-pre-line m-0">
                        ${clan.description || ''}
                    </div>
                </div>

                <div class="pb-3 border-b border-[#2A2A2A]">
                    <div class="text-sm font-bold text-gray-200 mb-1.5">Clan Labels</div>
                    <div class="flex flex-wrap gap-1.5">${labels}</div>
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
            ${renderCapitalCard()}
            ${renderMembershipCard()}
        </div>
    `;

    // Capital Gold card jumps to the Raid tab
    document.getElementById('raidCard')?.addEventListener('click', () => document.getElementById('tab-raid')?.click());
}
