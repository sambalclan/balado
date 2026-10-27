export const fmt = (n) => Number(n || 0).toLocaleString('en-US');

export const dayLabel = (date) => new Date(date + 'T12:00:00')
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

const STAT_COLS = { 3: 'grid-cols-3', 4: 'grid-cols-4' };

const renderStatTile = ({ label, value, color = 'text-white' }) => `
    <div class="rounded-md bg-[#141414] border border-[#2A2A2A] px-1.5 py-1 text-center leading-tight">
        <p class="text-[11px] font-bold ${color}">${value}</p>
        <p class="text-[7px] tracking-wide uppercase text-[#6B7280]">${label}</p>
    </div>`;

// Area chart (plain SVG, no library). points: [{ label, value }]
// stats: [{ label, value, color? }] shown as small tiles under the chart
export function renderAreaChart({ title, subtitle, points, stats = [], note = '', extraClass = '' }) {
    if (points.length < 2) return '';

    const W = 340, H = 160, L = 34, R = 26, T = 24, B = 26;
    let min = Math.min(...points.map((p) => p.value));
    let max = Math.max(...points.map((p) => p.value));
    if (min === max) { min -= 1; max += 1; }

    const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
    const y = (v) => T + ((max - v) * (H - T - B)) / (max - min);
    const pts = points.map((p, i) => [x(i), y(p.value)]);

    const line = pts.map(([px, py], i) => {
        if (i === 0) return `M${px},${py}`;
        const mid = (pts[i - 1][0] + px) / 2;
        return `C${mid},${pts[i - 1][1]} ${mid},${py} ${px},${py}`;
    }).join(' ');
    const area = `${line} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z`;
    const axis = 'fill="#8B8F98" font-size="9"';

    return `
        <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3 ${extraClass}">
            <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide">${title}</h4>
            <p class="text-[10px] text-[#8B8F98] mb-2">${subtitle}</p>
            <svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="${subtitle}">
                <line x1="${L}" y1="${y(max)}" x2="${W - R}" y2="${y(max)}" class="chart-grid"/>
                <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="chart-grid"/>
                <text x="${L - 6}" y="${y(max) + 3}" text-anchor="end" ${axis}>${max}</text>
                <text x="${L - 6}" y="${H - B + 3}" text-anchor="end" ${axis}>${min}</text>
                <path d="${area}" fill="rgba(59,130,246,0.15)"/>
                <path d="${line}" fill="none" stroke="#3B82F6" stroke-width="2"/>
                ${pts.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="3.5" fill="#3B82F6"/>`).join('')}
                ${pts.map(([px, py], i) => `<text x="${px}" y="${py - 8}" text-anchor="middle" fill="#D1D5DB" font-size="9" font-weight="600">${points[i].value}</text>`).join('')}
                ${points.map((p, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" ${axis}>${p.label}</text>`).join('')}
            </svg>
            ${stats.length ? `<div class="grid ${STAT_COLS[stats.length] || 'grid-cols-3'} gap-1 mt-2">${stats.map(renderStatTile).join('')}</div>` : ''}
            ${note ? `<p class="text-[8px] text-[#6B7280] mt-1.5">${note}</p>` : ''}
        </div>`;
}