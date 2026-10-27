import { state } from './state.js';
import { roleName, getTHImage, escapeHtml } from './constants.js';
import { dayLabel } from './chart.js';
import { endedWars, raidWeeks, seasonDate } from './promotion.js';

const TOP_COUNT = 5;       // how many members to show
const LOW_DONATION = 200;  // donations below this count as a (minor) flag
const SKIP_ROLES = ['leader', 'coLeader'];

// Season-to-date problems per member: missed war attacks, skipped raid weekends, low donations
function scoreWatchlist() {
    const wars = endedWars();
    const raids = raidWeeks();

    const rows = (state.clan?.memberList || [])
        .filter((m) => !SKIP_ROLES.includes(m.role))
        .map((m) => {
            // War: only wars where the member was in the lineup
            let missedWar = 0;
            wars.forEach((w) => {
                const me = (w.clan?.members || []).find((x) => x.tag === m.tag);
                if (me) missedWar += Math.max((w.attacksPerMember || 2) - (me.attacks?.length || 0), 0);
            });

            // Raid: a weekend counts as skipped when the member has no attacks (or is not listed)
            const skippedRaid = raids.filter((r) => {
                const me = (r.members || []).find((x) => x.tag === m.tag);
                return !(me?.attacks > 0);
            }).length;

            const lowDonation = (m.donations || 0) < LOW_DONATION;
            const score = missedWar * 2 + skippedRaid * 3 + (lowDonation ? 1 : 0);

            const reasons = [];
            if (wars.length && missedWar) reasons.push(`${missedWar} serangan war terlewat`);
            if (raids.length && skippedRaid) reasons.push(`${skippedRaid}/${raids.length} raid tidak ikut`);
            if (lowDonation) reasons.push(`Donasi ${m.donations || 0}`);

            return { member: m, score, reasons };
        })
        // Low donations alone is not enough to be listed (early in a season everyone is low)
        .filter((r) => r.score > 1)
        .sort((a, b) => b.score - a.score);

    return { rows, wars: wars.length, raids: raids.length };
}

const renderRow = ({ member: m, reasons }, i) => `
    <div class="flex items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-[#2A2A2A]' : ''}">
        <span class="w-3 text-[10px] font-mono text-[#6B7280]">${i + 1}</span>
        <img src="${getTHImage(m.townHallLevel)}" class="w-9 h-9 shrink-0 object-contain"
             alt="TH${m.townHallLevel}" onerror="this.style.visibility='hidden'">
        <div class="min-w-0 flex-1 leading-tight">
            <p class="text-[13px] font-bold text-white truncate">${escapeHtml(m.name)}</p>
            <p class="text-[9px] font-semibold tracking-wide uppercase text-[#D4A72C]">${roleName(m.role)} · TH${m.townHallLevel}</p>
            <p class="text-[9px] text-red-400 mt-0.5">${reasons.join(' · ')}</p>
        </div>
    </div>`;

// "Watchlist" card for the About page: members who need attention this season
export function renderWatchlistCard() {
    const { rows, wars, raids } = scoreWatchlist();
    if (!wars && !raids) return ''; // no war/raid data yet, nothing meaningful to judge

    const top = rows.slice(0, TOP_COUNT);
    return `
        <div class="w-full bg-[#1a1a1a] border border-[#2A2A2A] rounded-xl p-3">
            <h4 class="medieval text-[11px] font-bold text-[#D4A72C] uppercase tracking-wide mb-2">Watchlist</h4>
            ${top.length
                ? `<div class="rounded-xl overflow-hidden border border-[#2A2A2A]">${top.map(renderRow).join('')}</div>`
                : '<p class="text-xs text-[#8B8F98] text-center py-3">Semua anggota aktif musim ini.</p>'}
            <p class="text-[8px] text-[#6B7280] mt-1.5">Season sejak ${dayLabel(seasonDate())} · ${wars} war · ${raids} raid · Leader &amp; CoLead tidak dihitung</p>
        </div>`;
}
