import { fetchClanData, fetchClanHistory, fetchLatestRaid, fetchLatestCwl, fetchWarIndex, fetchWarData, fetchRaidIndex, fetchRaidData, clearLiveCache } from './api.js';
import { setWarData, setClanHistory, setRaidData, setRaids, setCwlData } from './state.js';
import { FILTER_ON, FILTER_OFF } from './constants.js';
import { renderAbout, renderSettings } from './render.js';
import { renderRaid } from './raid.js';
import { renderMembers } from './members.js';
import { renderWar, renderCwl } from './war.js';

// ═══ State ═════════════════════════════════════════════════════════════
const VIEWS = ['about', 'members', 'battle', 'raid', 'settings'];
let latestClanData = null;
let currentView = 'about';
let lastTab = 'about'; // tab to return to when Settings is closed
let warMode = 'war'; // 'war' or 'cwl'

// ═══ Navigation & Views ════════════════════════════════════════════════
// Retrigger the light fade/slide animation on an element
function animateIn(el) {
    if (!el) return;
    el.classList.remove('view-anim');
    void el.offsetWidth; // force reflow so the animation restarts
    el.classList.add('view-anim');
}

function moveNavIndicator(instant = false) {
    const nav = document.getElementById('bottomToolbar');
    const active = nav?.querySelector('button.active');
    if (!nav || !active) return;

    let indicator = nav.querySelector('.nav-indicator');
    if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'nav-indicator';
        nav.prepend(indicator);
        instant = true;
    }

    if (instant) indicator.style.transition = 'none';
    indicator.style.width = active.offsetWidth + 'px';
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
    if (instant) { void indicator.offsetWidth; indicator.style.transition = ''; }
}

// Highlight a War/CWL switch button
function setBattleButton(btn, active) {
    FILTER_ON.split(' ').forEach((c) => btn.classList.toggle(c, active));
    FILTER_OFF.split(' ').forEach((c) => btn.classList.toggle(c, !active));
}

function showBattleMode() {
    const isWar = warMode === 'war';
    const warSection = document.getElementById('section-war');
    const cwlSection = document.getElementById('section-cwl');

    warSection.classList.toggle('hidden', !isWar);
    cwlSection.classList.toggle('hidden', isWar);
    setBattleButton(document.getElementById('tab-battle-war'), isWar);
    setBattleButton(document.getElementById('tab-battle-cwl'), !isWar);
    if (!isWar) renderCwl();
    animateIn(isWar ? warSection : cwlSection);
}

function switchView(view = 'about') {
    const target = VIEWS.includes(view) && document.getElementById('section-' + view) ? view : 'about';
    currentView = target;

    document.querySelectorAll('main > section').forEach((section) => {
        const isTarget = section.id === 'section-' + target;
        section.classList.toggle('hidden-section', !isTarget);
        if (isTarget && section.id !== 'section-battle') animateIn(section);
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
    moveNavIndicator();
}

function bindTabs() {
    // The header is re-rendered, so listen on the document
    document.addEventListener('click', (e) => {
        if (e.target.closest('#refreshBtn')) refreshAll();
        else if (e.target.closest('#settingsBtn')) switchView('settings');
        else if (e.target.closest('[data-settings-back]')) switchView(lastTab);
        else if (e.target.closest('#tab-battle-war')) { warMode = 'war'; switchView('battle'); }
        else if (e.target.closest('#tab-battle-cwl')) { warMode = 'cwl'; switchView('battle'); }
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
        const [clan, history, raid, cwl] = await Promise.allSettled([
            fetchClanData(), fetchClanHistory(), fetchLatestRaid(), fetchLatestCwl(),
            loadRaidWeeks(), loadWarData(), // these render their own pages
        ]);
        // Keep the old data when a request fails
        if (clan.status === 'fulfilled' && clan.value) latestClanData = clan.value;
        if (history.status === 'fulfilled') setClanHistory(history.value);
        if (raid.status === 'fulfilled') setRaidData(raid.value);
        if (cwl.status === 'fulfilled') setCwlData(cwl.value);

        renderClanViews();
        if (warMode === 'cwl') renderCwl();
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

        // Load membership history, capital gold and CWL in the background, then re-render
        Promise.allSettled([fetchClanHistory(), fetchLatestRaid(), fetchLatestCwl()]).then(([history, raid, cwl]) => {
            if (history.status === 'fulfilled') setClanHistory(history.value);
            if (raid.status === 'fulfilled') setRaidData(raid.value);
            if (cwl.status === 'fulfilled') setCwlData(cwl.value);
            renderClanViews();
        });
        loadRaidWeeks().then(renderClanViews);

        await loadWarData();
        renderClanViews();
    } catch { /* clan data unavailable */ }
}

document.addEventListener('DOMContentLoaded', () => {
    switchView();
    init();
    bindTabs();
    window.addEventListener('resize', () => moveNavIndicator(true));
});
