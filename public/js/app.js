import { fetchClanData, fetchClanHistory, fetchLatestRaid, fetchLatestCwl, fetchCwlWars, fetchWarIndex, fetchWarData, fetchRaidIndex, fetchRaidData, clearLiveCache } from './api.js';
import { setWarData, setClanHistory, setRaidData, setRaids, setCwlData, setCwlWars } from './state.js';
import { renderMenuTabs, setMenuActive } from './constants.js';
import { renderAbout, renderSettings } from './render.js';
import { renderMembers } from './members.js';
import { renderWar, renderCwl, renderRaid } from './war.js';

// ═══ State ═════════════════════════════════════════════════════════════
const VIEWS = ['about', 'members', 'battle', 'settings'];
let latestClanData = null;
let currentView = 'about';
let lastTab = 'about'; // tab to return to when Settings is closed
let warMode = 'war'; // 'war', 'cwl' or 'raid'

// ═══ Navigation & Views ════════════════════════════════════════════════
const BATTLE_MODES = [
    { id: 'war', label: 'War' },
    { id: 'cwl', label: 'CWL' },
    { id: 'raid', label: 'Raid' },
];

function showBattleMode() {
    // The War / CWL / Raid options are built here, not hardcoded in index.html
    const box = document.getElementById('battleTabs');
    if (box && !box.firstElementChild) box.innerHTML = renderMenuTabs('data-battle', BATTLE_MODES, warMode);
    setMenuActive(box?.firstElementChild, 'data-battle', warMode);

    BATTLE_MODES.forEach(({ id }) => {
        document.getElementById('section-' + id).classList.toggle('hidden', id !== warMode);
    });
    if (warMode === 'cwl') renderCwl();
    if (warMode === 'raid') renderRaid();
}

function switchView(view = 'about') {
    const target = VIEWS.includes(view) && document.getElementById('section-' + view) ? view : 'about';
    currentView = target;

    document.querySelectorAll('main > section').forEach((section) => {
        const isTarget = section.id === 'section-' + target;
        section.classList.toggle('hidden-section', !isTarget);
    });

    if (target === 'battle') showBattleMode();

    // Settings is a page, not a tab: the nav keeps highlighting the tab we came from
    if (target === 'settings') {
        renderSettings();
        window.scrollTo(0, 0);
        return;
    }

    lastTab = target;
    document.querySelectorAll('#bottomToolbar button').forEach((btn) => btn.classList.remove('active'));
    document.getElementById('tab-' + target)?.classList.add('active');
}

function bindTabs() {
    // The header is re-rendered, so listen on the document
    document.addEventListener('click', (e) => {
        if (e.target.closest('#refreshBtn')) refreshAll();
        else if (e.target.closest('#settingsBtn')) switchView('settings');
        else if (e.target.closest('[data-settings-back]')) switchView(lastTab);
        else {
            const item = e.target.closest('[data-battle]');
            if (item && item.dataset.battle !== warMode) { warMode = item.dataset.battle; switchView('battle'); }
        }
    });
    VIEWS.filter((view) => view !== 'settings').forEach((view) => {
        document.getElementById('tab-' + view)?.addEventListener('click', () => switchView(view));
    });
}

// ═══ Data Loading ══════════════════════════════════════════════════════
// Load every file of an index; each result keeps its file name in __file
async function loadAll(index, fetchFile) {
    const results = await Promise.allSettled((index || []).map((filename) => fetchFile(filename)));
    return results
        .map((r, i) => (r.status === 'fulfilled' && r.value ? { ...r.value, __file: index[i] } : null))
        .filter(Boolean);
}

async function loadWarData() {
    try {
        const index = await fetchWarIndex();
        const wars = (await loadAll(index, fetchWarData)).sort((a, b) => {
            const aDate = (a.preparationStartTime || a.startTime || '').slice(0, 10);
            const bDate = (b.preparationStartTime || b.startTime || '').slice(0, 10);
            return bDate.localeCompare(aDate); // Newest first
        });

        if (wars.length === 0) return renderWar(null);
        setWarData(wars[0]); // Latest war
        renderWar(wars);
    } catch {
        renderWar(null);
    }
}

async function loadRaidWeeks() {
    try {
        setRaids(await loadAll(await fetchRaidIndex(), fetchRaidData));
    } catch { setRaids([]); }
    renderRaid();
}

// Saved CWL wars (one per round); keeps the old data when the request fails
async function loadCwlWars() {
    try {
        const wars = await fetchCwlWars();
        if (wars) setCwlWars(wars);
    } catch { /* keep old data */ }
    renderCwl();
}

// ═══ Init ══════════════════════════════════════════════════════════════
// About and Members both show data that loads in the background
const renderClanViews = () => {
    renderAbout(latestClanData);
    renderMembers(latestClanData);
};

// ═══ Refresh (clan, war, CWL and raid) ═════════════════════════════════
let refreshing = false;

function setRefreshing(on) {
    const btn = document.getElementById('refreshBtn');
    if (!btn) return;
    btn.disabled = on;
    btn.querySelector('.material-symbols-outlined')?.classList.toggle('animate-spin', on);
}

async function refreshAll() {
    if (refreshing) return;
    refreshing = true;
    setRefreshing(true);
    clearLiveCache();

    try {
        const [clan, raid, cwl] = await Promise.allSettled([
            fetchClanData(), fetchLatestRaid(), fetchLatestCwl(),
            loadRaidWeeks(), loadWarData(), loadCwlWars(), // these render their own pages
        ]);
        // Keep the old data when a request fails
        if (clan.status === 'fulfilled' && clan.value) latestClanData = clan.value;
        if (raid.status === 'fulfilled') setRaidData(raid.value);
        if (cwl.status === 'fulfilled') setCwlData(cwl.value);

        renderClanViews();
        if (warMode === 'cwl') renderCwl();

        // Membership history comes last: it is many small file downloads
        const history = await Promise.allSettled([fetchClanHistory()]);
        if (history[0].status === 'fulfilled') { setClanHistory(history[0].value); renderClanViews(); }
    } finally {
        refreshing = false;
        setRefreshing(false); // the header was re-rendered, so look the button up again
    }
}

async function init() {
    try {
        latestClanData = await fetchClanData();
        renderClanViews();
        switchView(currentView);

        // Load capital gold and CWL in the background, then re-render
        Promise.allSettled([fetchLatestRaid(), fetchLatestCwl()]).then(([raid, cwl]) => {
            if (raid.status === 'fulfilled') setRaidData(raid.value);
            if (cwl.status === 'fulfilled') setCwlData(cwl.value);
            renderClanViews();
        });
        loadRaidWeeks().then(renderClanViews);
        loadCwlWars().then(renderClanViews);

        await loadWarData();
        renderClanViews();

        // Membership history last, so its file downloads never delay the live data above
        fetchClanHistory().then((history) => { setClanHistory(history); renderClanViews(); }).catch(() => {});
    } catch { /* clan data unavailable */ }
}

document.addEventListener('DOMContentLoaded', () => {
    renderMembers(null); // show the member options right away
    renderWar(null); // and the war options
    switchView();
    init();
    bindTabs();
});
