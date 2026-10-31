// SHARED: ROLES & TOWN HALL
export const roleMap = { leader: 'Leader', coLeader: 'CoLead', admin: 'Elder', member: 'Member' };
export const roleWeight = { leader: 4, coLeader: 3, admin: 2, member: 1 };
export const roleName = role => roleMap[role] || role;
export const getTHImage = lv => `assets/Town_Hall${lv}.webp`;

// SHARED: DATES & TEXT
export function parseCoCDate(dateStr) {
    if (!dateStr) return null;
    return new Date(Date.UTC(
        dateStr.substring(0, 4),
        parseInt(dateStr.substring(4, 6)) - 1,
        dateStr.substring(6, 8),
        dateStr.substring(9, 11),
        dateStr.substring(11, 13),
        dateStr.substring(13, 15)
    ));
}

export function escapeHtml(value) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, c => map[c]);
}

export function dateFrom(raw) {
    const m = String(raw ?? '').match(/(\d{4})-?(\d{2})-?(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

export const warDate = w => dateFrom(w.endTime || w.startTime || w.preparationStartTime || w.__file);

// SHARED: WAR HELPERS
export const isEndedWar = w => ['warEnded', 'ended'].includes(w.state);
export const warStars = member => (member.attacks || []).reduce((n, a) => n + (a.stars || 0), 0);

// SHARED: NUMBER FORMAT
export const fmt = n => Number(n || 0).toLocaleString('en-US');

export const dayLabel = date => new Date(date + 'T12:00:00')
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

// SHARED: UI BLOCKS
export const pageCard = (inner, rounded = 'rounded-xl') =>
    `<div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] ${rounded} p-3">${inner}</div>`;

export const pageShell = inner => `<div class="px-0 py-3 pb-28 w-full">${inner}</div>`;
export const pagePanel = inner => pageShell(pageCard(inner, 'rounded-2xl'));

export const emptyCard = text => `
    <div class="bg-[#1E1E1E] border border-[#3A3A3A] p-4 rounded-xl text-center text-gray-400">
        ${text}
    </div>`;

export const backButton = attr => `
    <button type="button" ${attr} aria-label="Back"
        class="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-90 transition-all">
        <span class="material-symbols-outlined text-[20px]">arrow_back</span>
    </button>`;

// PILL TABS
export const renderPillTabs = (attr, items, activeId) => `
    <div class="pill-tabs" style="--tabs:${items.length};--tab-index:${Math.max(items.findIndex(t => t.id === activeId), 0)}">
        <div class="tab-pill" aria-hidden="true"></div>
        ${items.map(({ id, label }) => `
            <button type="button" ${attr}="${id}" class="${id === activeId ? 'active' : ''}" aria-pressed="${id === activeId}">
                ${label}
            </button>`).join('')}
    </div>`;

export function setPillActive(tabs, attr, id) {
    if (!tabs) return;
    const buttons = [...tabs.querySelectorAll(`[${attr}]`)];
    tabs.style.setProperty('--tab-index', Math.max(buttons.findIndex(b => b.getAttribute(attr) === id), 0));
    buttons.forEach(b => {
        const active = b.getAttribute(attr) === id;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
    });
}

// SHARED: CHARTS
const STAT_COLS = { 3: 'grid-cols-3', 4: 'grid-cols-4' };

const renderStatTile = ({ label, value, color = 'text-white' }) => `
    <div class="rounded-md bg-[#141414] border border-[#2A2A2A] px-1.5 py-1 text-center leading-tight">
        <p class="text-[11px] font-bold ${color}">${value}</p>
        <p class="text-[7px] tracking-wide uppercase text-[#6B7280]">${label}</p>
    </div>`;

// AREA CHART - SUPPORT 1 DATA
export function renderAreaChart({ title, subtitle, points = [], stats = [], note = '', extraClass = '', bare = false }) {
    const data = points.filter(p => p && Number.isFinite(Number(p.value)));
    if (!data.length) return '';

    const W = 340, H = 160, L = 34, R = 26, T = 24, B = 26;
    const values = data.map(p => Number(p.value));
    let min = Math.min(...values), max = Math.max(...values);

    if (min === max) {
        min -= 1;
        max += 1;
    }

    const x = i => data.length === 1
        ? (L + W - R) / 2
        : L + (i * (W - L - R)) / (data.length - 1);

    const y = v => T + ((max - v) * (H - T - B)) / (max - min);
    const pts = data.map((p, i) => [x(i), y(Number(p.value))]);

    const line = pts.length === 1
        ? `M${pts[0][0] - 30},${pts[0][1]} L${pts[0][0] + 30},${pts[0][1]}`
        : pts.map(([px, py], i) => {
            if (i === 0) return `M${px},${py}`;
            const mid = (pts[i - 1][0] + px) / 2;
            return `C${mid},${pts[i - 1][1]} ${mid},${py} ${px},${py}`;
        }).join(' ');

    const area = pts.length > 1
        ? `${line} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z`
        : '';

    const axis = 'fill="#8B8F98" font-size="9"';

    return `
        <div class="w-full ${bare ? '' : 'bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3'} ${extraClass}">
            <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide">${escapeHtml(title)}</h4>
            <p class="text-[10px] text-[#8B8F98] mb-2">${escapeHtml(subtitle)}</p>
            <svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="${escapeHtml(subtitle)}">
                <line x1="${L}" y1="${y(max)}" x2="${W - R}" y2="${y(max)}" class="chart-grid"/>
                <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="chart-grid"/>
                <text x="${L - 6}" y="${y(max) + 3}" text-anchor="end" ${axis}>${max}</text>
                <text x="${L - 6}" y="${H - B + 3}" text-anchor="end" ${axis}>${min}</text>
                ${area ? `<path d="${area}" fill="rgba(59,130,246,0.15)"/>` : ''}
                <path d="${line}" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round"/>
                ${pts.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="3.5" fill="#3B82F6"/>`).join('')}
                ${pts.map(([px, py], i) => `<text x="${px}" y="${py - 8}" text-anchor="middle" fill="#D1D5DB" font-size="9" font-weight="600">${values[i]}</text>`).join('')}
                ${data.map((p, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" ${axis}>${escapeHtml(p.label ?? '')}</text>`).join('')}
            </svg>
            ${stats.length ? `<div class="grid ${STAT_COLS[stats.length] || 'grid-cols-3'} gap-1 mt-2">${stats.map(renderStatTile).join('')}</div>` : ''}
            ${note ? `<p class="text-[8px] text-[#6B7280] mt-1.5">${escapeHtml(note)}</p>` : ''}
        </div>`;
}

// COMBINED CHART - MEMBERSHIP & WAR
// 1 data  = horizontal line + point
// 2+ data = connected line following actual values
// Each series uses its own Y axis.
export function renderCombinedChart({ title, subtitle, a, b, stats = [], note = '' }) {
    const clean = s => (Array.isArray(s?.points) ? s.points : [])
        .filter(p => p?.date && Number.isFinite(Number(p.value)))
        .map(p => ({ date: dateFrom(p.date), value: Number(p.value) }))
        .filter(p => p.date)
        .sort((p, q) => p.date.localeCompare(q.date));

    const pa = clean(a);
    const pb = clean(b);

    const W = 340, H = 190, L = 34, R = 34, T = 34, B = 26;
    const plotW = W - L - R;
    const plotH = H - T - B;
    const axis = 'font-size="9"';

    const dates = [...new Set([...pa, ...pb].map(p => p.date))].sort();

    if (!dates.length) {
        return `
            <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3">
                <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide">${escapeHtml(title)}</h4>
                <p class="text-[10px] text-[#8B8F98]">${escapeHtml(subtitle)}</p>
                <div class="h-28 flex items-center justify-center text-[11px] text-gray-500">
                    Waiting for statistics
                </div>
                ${stats.length ? `<div class="grid ${STAT_COLS[stats.length] || 'grid-cols-3'} gap-1 mt-2">${stats.map(renderStatTile).join('')}</div>` : ''}
                ${note ? `<p class="text-[8px] text-[#6B7280] mt-1.5">${escapeHtml(note)}</p>` : ''}
            </div>`;
    }

    const time = d => new Date(d + 'T12:00:00').getTime();
    const t0 = time(dates[0]);
    const t1 = time(dates[dates.length - 1]);

    const x = d => t1 === t0
        ? L + plotW / 2
        : L + ((time(d) - t0) / (t1 - t0)) * plotW;

    const series = (s, pts, side) => {
        if (!pts.length) return '';

        const values = pts.map(p => p.value);
        let min = Math.min(...values);
        let max = Math.max(...values);

        if (min === max) {
            min -= 1;
            max += 1;
        }

        const y = v => T + ((max - v) * plotH) / (max - min);
        const P = pts.map(p => [x(p.date), y(p.value), p.value]);

        // Draw a short horizontal indicator when only one point exists.
        // This is a visual marker, not an additional historical record.
        const line = P.length === 1
            ? `M${P[0][0] - 30},${P[0][1]} L${P[0][0] + 30},${P[0][1]}`
            : P.map(([px, py], i) => {
                if (i === 0) return `M${px},${py}`;
                const mid = (P[i - 1][0] + px) / 2;
                return `C${mid},${P[i - 1][1]} ${mid},${py} ${px},${py}`;
            }).join(' ');

        const area = P.length > 1 && side === 'left'
            ? `<path d="${line} L${P[P.length - 1][0]},${H - B} L${P[0][0]},${H - B} Z" fill="${s.color}" fill-opacity="0.15"/>`
            : '';

        const ax = side === 'left' ? L - 6 : W - R + 6;
        const anchor = side === 'left' ? 'end' : 'start';
        const labelY = py => side === 'left' || py + 15 > H - B - 2 ? py - 8 : py + 15;

        return `
            <text x="${ax}" y="${y(max) + 3}" text-anchor="${anchor}" fill="${s.color}" ${axis}>${max}</text>
            <text x="${ax}" y="${y(min) + 3}" text-anchor="${anchor}" fill="${s.color}" ${axis}>${min}</text>
            ${area}
            <path d="${line}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            ${P.map(([px, py]) => `
                <circle cx="${px}" cy="${py}" r="4" fill="${s.color}" stroke="#1a1a1a" stroke-width="1.5"/>
            `).join('')}
            ${P.map(([px, py, value]) => `
                <text x="${px}" y="${labelY(py)}" text-anchor="middle" fill="${s.labelColor}" font-size="9" font-weight="600">
                    ${value}
                </text>
            `).join('')}`;
    };

    const xLabels = dates.map((d, i) => {
        const date = new Date(d + 'T12:00:00');
        const previous = i ? new Date(dates[i - 1] + 'T12:00:00') : null;
        const monthChanged = !previous || date.getMonth() !== previous.getMonth() || date.getFullYear() !== previous.getFullYear();

        const label = monthChanged
            ? date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
            : String(date.getDate());

        return `<text x="${x(d)}" y="${H - 8}" text-anchor="middle" fill="#8B8F98" ${axis}>${label}</text>`;
    }).join('');

    const legend = [a, b].map((s, i) => `
        <circle cx="${L + i * 96 + 4}" cy="12" r="4" fill="${s.color}"/>
        <text x="${L + i * 96 + 12}" y="15" fill="#D1D5DB" ${axis}>${escapeHtml(s.name)}</text>
    `).join('');

    return `
        <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3">
            <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide">${escapeHtml(title)}</h4>
            <p class="text-[10px] text-[#8B8F98] mb-2">${escapeHtml(subtitle)}</p>

            <svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="${escapeHtml(subtitle)}">
                ${legend}

                <line x1="${L}" y1="${T}" x2="${W - R}" y2="${T}" class="chart-grid"/>
                <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="chart-grid"/>

                ${series(a, pa, 'left')}
                ${series(b, pb, 'right')}

                ${xLabels}
            </svg>

            ${stats.length ? `
                <div class="grid ${STAT_COLS[stats.length] || 'grid-cols-3'} gap-1 mt-2">
                    ${stats.map(renderStatTile).join('')}
                </div>` : ''}

            ${note ? `<p class="text-[8px] text-[#6B7280] mt-1.5">${escapeHtml(note)}</p>` : ''}
        </div>`;
}