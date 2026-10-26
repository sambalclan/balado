import { getTHImage, roleMap, escapeHtml, warDate } from './constants.js';

// Member detail popup: war stats + capital raid.
// Usage: openMemberDetail(member, { wars, raid })

const MODAL_ID = 'section-member-detail';
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// Collect every war the member took part in (preparation wars are skipped)
function collectWarStats(tag, wars) {
    const rows = [];
    for (const w of wars || []) {
        if (!w || w.state === 'preparation') continue;
        const me = (w.clan?.members || []).find((m) => m.tag === tag);
        if (!me) continue;
        rows.push({
            date: warDate(w),
            opponent: w.opponent?.name || '',
            attacks: me.attacks || [],
            max: w.attacksPerMember || 2,
            ended: ['warEnded', 'ended'].includes(w.state),
        });
    }

    const attacks = rows.flatMap((r) => r.attacks);
    const stars = attacks.reduce((n, a) => n + (a.stars || 0), 0);
    const destruction = attacks.reduce((n, a) => n + (a.destructionPercentage || 0), 0);
    return {
        rows,
        stars,
        attacksUsed: attacks.length,
        threeStars: attacks.filter((a) => a.stars === 3).length,
        avg: attacks.length ? Math.round(destruction / attacks.length) + '%' : '-',
        missed: rows.reduce((n, r) => n + (r.ended ? Math.max(0, r.max - r.attacks.length) : 0), 0),
    };
}

const statTile = (label, value, color = 'text-white') => `
    <div class="rounded-xl bg-[#141414] border border-[#2A2A2A] px-2 py-2 text-center leading-tight">
        <p class="text-sm font-bold ${color}">${value}</p>
        <p class="text-[8px] tracking-wide uppercase text-[#6B7280]">${label}</p>
    </div>`;

const sectionTitle = (text) =>
    `<h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide mb-2">${text}</h4>`;

function warSection(member, wars) {
    const war = collectWarStats(member.tag, wars);
    if (war.rows.length === 0) {
        return `${sectionTitle('War')}<p class="text-xs text-[#8B8F98]">No war data for this member.</p>`;
    }

    const recent = [...war.rows]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5)
        .map((r) => {
            const text = r.attacks.length
                ? r.attacks.map((a) => `${a.stars || 0}★ ${a.destructionPercentage || 0}%`).join(' · ')
                : (r.ended ? 'No attack' : 'In war');
            return `
            <div class="flex items-center justify-between gap-2 py-1.5 border-t border-[#2A2A2A] first:border-t-0">
                <div class="min-w-0 leading-tight">
                    <p class="text-[10px] font-semibold text-white truncate">${escapeHtml(r.opponent)}</p>
                    <p class="text-[8px] font-mono text-[#6B7280]">${r.date || '-'}</p>
                </div>
                <span class="shrink-0 text-[10px] font-bold text-[#D4A72C]">${text}</span>
            </div>`;
        }).join('');

    return `
        ${sectionTitle('War')}
        <div class="grid grid-cols-3 gap-2 mb-2">
            ${statTile('Wars', fmt(war.rows.length))}
            ${statTile('Stars', fmt(war.stars), 'text-[#D4A72C]')}
            ${statTile('Avg %', war.avg)}
            ${statTile('3 Stars', fmt(war.threeStars), 'text-green-500')}
            ${statTile('Attacks', fmt(war.attacksUsed))}
            ${statTile('Missed', fmt(war.missed), war.missed ? 'text-red-400' : 'text-white')}
        </div>
        <p class="text-[9px] font-semibold tracking-wide uppercase text-[#8B8F98] mt-3">Recent wars</p>
        <div class="rounded-xl border border-[#2A2A2A] px-3">${recent}</div>`;
}

function raidSection(member, raid) {
    const me = (raid?.members || []).find((m) => m.tag === member.tag);
    if (!me) {
        return `${sectionTitle('Capital Raid')}<p class="text-xs text-[#8B8F98]">Not in the latest raid weekend.</p>`;
    }
    const limit = (me.attackLimit || 0) + (me.bonusAttackLimit || 0);
    return `
        ${sectionTitle('Capital Raid')}
        <div class="grid grid-cols-2 gap-2">
            ${statTile('Capital Gold', fmt(me.capitalResourcesLooted), 'text-[#D4A72C]')}
            ${statTile('Raid attacks', `${fmt(me.attacks)}/${fmt(limit)}`)}
        </div>`;
}

// Build the popup HTML (kept separate from the DOM so it is easy to test)
export function buildMemberDetailHtml(member, { wars = [], raid = null } = {}) {
    const league = member.leagueTier?.iconUrls?.small || member.league?.iconUrls?.small || '';
    const trophies = `${league ? `<img src="${league}" class="inline w-4 h-4 mr-1 object-contain" alt="">` : ''}${fmt(member.trophies)}`;

    return `
    <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-2xl p-4">
        <div class="flex items-center gap-3 mb-4">
            <button type="button" data-back aria-label="Back"
                    class="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white
                           flex items-center justify-center active:scale-90 transition-all">
                <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <img src="${getTHImage(member.townHallLevel)}" class="w-12 h-12 object-contain" alt="TH${member.townHallLevel}"
                 onerror="this.style.visibility='hidden'">
            <div class="min-w-0 flex-1 leading-tight">
                <p class="text-base font-bold text-white truncate">${escapeHtml(member.name)}</p>
                <p class="text-[10px] font-mono text-[#8B8F98]">${escapeHtml(member.tag)}</p>
                <p class="text-[9px] font-semibold tracking-wide text-[#D4A72C] uppercase">
                    ${roleMap[member.role] || member.role || ''} · XP ${member.expLevel ?? '-'}
                </p>
            </div>
        </div>

        <div class="grid grid-cols-3 gap-2 mb-4">
            ${statTile('Trophies', trophies, 'text-[#D4A72C]')}
            ${statTile('Donated', fmt(member.donations), 'text-[9px] text-green-500')}
            ${statTile('Received', fmt(member.donationsReceived), 'text-red-400')}
        </div>

        <div class="mb-4">${warSection(member, wars)}</div>
        <div>${raidSection(member, raid)}</div>
    </div>`;
}

export function openMemberDetail(member, options = {}) {
    if (!member) return;

    // Own page (section) inside the same index.html, like a tab
    let page = document.getElementById(MODAL_ID);
    if (!page) {
        page = document.createElement('section');
        page.id = MODAL_ID; // "section-..." so the bottom tabs hide it via switchView
        page.className = 'w-full';
        document.getElementById('section-war').after(page);
    }

    page.innerHTML = `<div class="px-0 py-3 pb-28 w-full">${buildMemberDetailHtml(member, options)}</div>`;

    document.querySelectorAll('[id^="section-"]').forEach((s) => {
        s.style.display = s.id === MODAL_ID ? '' : 'none';
    });
    window.scrollTo(0, 0);

    page.querySelector('[data-back]').onclick = () => document.getElementById('tab-members')?.click();
}
