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

// SHARED: THEME (the colours themselves live in style.css)
export const getTheme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

export function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch { /* storage can be blocked */ }
}

// SHARED: NUMBER FORMAT
export const fmt = n => Number(n || 0).toLocaleString('en-US');

// SHARED: UI BLOCKS
const pageCard = (inner, rounded = 'rounded-xl') =>
    `<div class="w-full bg-surface border border-divider ${rounded} p-3">${inner}</div>`;

export const pageShell = inner => `<div class="px-0 py-3 w-full">${inner}</div>`;
export const pagePanel = inner => pageShell(pageCard(inner, 'rounded-2xl'));

export const emptyCard = text => `
    <div class="rounded-xl border border-line bg-surface p-4 text-center text-muted">
        ${text}
    </div>`;

export const backButton = attr => `
    <button type="button" ${attr} aria-label="Back"
        class="shrink-0 w-9 h-9 rounded-full bg-tint-2 hover:bg-tint-3 text-main flex items-center justify-center active:scale-90 transition-all">
        <span class="material-symbols-outlined text-[20px]">arrow_back</span>
    </button>`;

// PILL TABS
// Option row (War / CWL / Raid, member roles, CWL view): flat box, no sliding highlight, no animation
export const renderMenuTabs = (attr, items, activeId) => `
    <div class="switch-box">
        ${items.map(({ id, label }) => `
            <button type="button" ${attr}="${id}" class="${id === activeId ? 'active' : ''}" aria-pressed="${id === activeId}">
                ${label}
            </button>`).join('')}
    </div>`;

export function setMenuActive(tabs, attr, id) {
    if (!tabs) return;
    tabs.querySelectorAll(`[${attr}]`).forEach(b => {
        const active = b.getAttribute(attr) === id;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
    });
}

