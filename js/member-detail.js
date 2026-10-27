import { getTHImage, escapeHtml } from './constants.js';
import { fmt } from './chart.js';

// Member detail page. Usage: openMemberDetail(member, { raid })

const MODAL_ID = 'section-member-detail';
const HEADING = 'text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide mb-2';

function raidSection(member, raid) {
    const me = (raid?.members || []).find((m) => m.tag === member.tag);
    if (!me) {
        return `<h4 class="${HEADING}">Capital Raid</h4><p class="text-xs text-[#8B8F98]">Not in the latest raid weekend.</p>`;
    }
    const limit = (me.attackLimit || 0) + (me.bonusAttackLimit || 0);
    return `
        <h4 class="${HEADING}">Capital Raid</h4>
        <div class="grid grid-cols-2 gap-2">
            <div class="rounded-xl bg-[#141414] border border-[#2A2A2A] px-2 py-2 text-center leading-tight">
                <p class="text-sm font-bold text-[#D4A72C]">${fmt(me.capitalResourcesLooted)}</p>
                <p class="text-[8px] tracking-wide uppercase text-[#6B7280]">Capital Gold</p>
            </div>
            <div class="rounded-xl bg-[#141414] border border-[#2A2A2A] px-2 py-2 text-center leading-tight">
                <p class="text-sm font-bold text-white">${fmt(me.attacks)}/${fmt(limit)}</p>
                <p class="text-[8px] tracking-wide uppercase text-[#6B7280]">Raid Attacks</p>
            </div>
        </div>`;
}

// Build the page HTML (kept separate from the DOM so it is easy to test)
export function buildMemberDetailHtml(member, { raid = null } = {}) {
    return `
    <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-4">
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
            </div>
        </div>

        <div class="mt-4">${raidSection(member, raid)}</div>
    </div>`;
}

export function openMemberDetail(member, options = {}) {
    if (!member) return;

    // Own page (section) inside the same index.html, like a tab
    let page = document.getElementById(MODAL_ID);
    if (!page) {
        page = document.createElement('section');
        page.id = MODAL_ID; // "section-..." so switchView hides it with the other pages
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