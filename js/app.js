import { fetchClanData, fetchClanHistory, fetchLatestRaid, fetchLatestCwl, fetchWarIndex, fetchWarData, fetchRaidIndex, fetchRaidData } from './api.js';
import { setWarData, setClanHistory, setRaidData, setRaids, setCwlData } from './state.js';
import { renderAbout, renderSettings } from './render.js';
import { renderRaid } from './raid.js';
import { renderMembers } from './members.js';
import { renderWar } from './war.js';

const VIEWS = ['about', 'members', 'war', 'raid', 'settings'];
let latestClanData = null;
let currentView = 'about';
let lastTab = 'about'; // tab to return to when Settings is closed

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

function switchView(view = 'about') {
    const target = VIEWS.includes(view) && document.getElementById('section-' + view) ? view : 'about';
    currentView = target;

    document.querySelectorAll('[id^="section-"]').forEach((section) => {
        const isTarget = section.id === 'section-' + target;
        section.classList.toggle('hidden-section', !isTarget);
        section.style.display = isTarget ? '' : 'none';
    });

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
        if (e.target.closest('#settingsBtn')) switchView('settings');
        else if (e.target.closest('[data-settings-back]')) switchView(lastTab);
    });
    VIEWS.filter((view) => view !== 'settings').forEach((view) => {
        document.getElementById('tab-' + view)?.addEventListener('click', () => switchView(view));
    });
}

async function loadWarData() {
    try {
        const index = await fetchWarIndex();
        if (!index || index.length === 0) return renderWar(null);

        const results = await Promise.allSettled(index.map(fetchWarData));
        const wars = results
            .map((r, i) => (r.status === 'fulfilled' && r.value ? { ...r.value, __file: index[i] } : null))
            .filter(Boolean)
            .sort((a, b) => {
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
        const index = await fetchRaidIndex();
        const results = await Promise.allSettled((index || []).map(fetchRaidData));
        setRaids(results
            .map((r, i) => (r.status === 'fulfilled' && r.value ? { ...r.value, __file: index[i] } : null))
            .filter(Boolean));
    } catch { setRaids([]); }
    renderRaid();
}

async function init() {
    try {
        latestClanData = await fetchClanData();
        renderAbout(latestClanData);
        renderMembers(latestClanData);
        switchView(currentView);

        // Load membership history, capital gold and CWL in the background, then re-render About
        Promise.allSettled([fetchClanHistory(), fetchLatestRaid(), fetchLatestCwl()]).then(([history, raid, cwl]) => {
            if (history.status === 'fulfilled') setClanHistory(history.value);
            if (raid.status === 'fulfilled') setRaidData(raid.value);
            if (cwl.status === 'fulfilled') setCwlData(cwl.value);
            renderAbout(latestClanData);
            renderMembers(latestClanData);
        });
        loadRaidWeeks().then(() => { renderAbout(latestClanData); renderMembers(latestClanData); });

        await loadWarData();
        renderAbout(latestClanData);
        renderMembers(latestClanData);
    } catch { /* clan data unavailable */ }
}

document.addEventListener('DOMContentLoaded', () => {
    switchView();
    init();
    bindTabs();
    window.addEventListener('resize', () => moveNavIndicator(true));
});
