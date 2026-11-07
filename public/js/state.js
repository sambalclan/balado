// Data shared between the pages (About, Members, War, Raid)
export const state = {
    clan: null,
    war: null,      // latest war
    wars: [],       // all wars (newest first)
    raid: null,     // latest raid weekend
    raids: [],      // all raid weekends (newest first)
    cwl: null,      // latest Clan War League group
    cwlWars: [],    // saved CWL wars, one per round (from /cwl/wars)
    history: [],    // members per day
};

export const setWarData = (war) => { state.war = war; };
export const setRaidData = (raid) => { state.raid = raid || null; };
export const setRaids = (raids) => { state.raids = raids || []; };
export const setCwlData = (cwl) => { state.cwl = cwl || null; };
export const setCwlWars = (wars) => { state.cwlWars = wars || []; };
export const setClanHistory = (history) => { state.history = history || []; };

// CWL rounds of the latest saved season, oldest round first.
// Our clan can be on either side of a CWL war, so each war is normalized:
// war.clan is always our clan, war.opponent is always the enemy.
export const getCwlRounds = () => {
    const saved = (state.cwlWars || []).filter((x) => x?.war);
    const seasons = [...new Set(saved.map((x) => x.season))].sort();
    const season = seasons.includes(state.cwl?.season) ? state.cwl.season : seasons[seasons.length - 1];
    const tag = state.clan?.tag;

    return saved
        .filter((x) => x.season === season)
        .map((x) => {
            const w = x.war;
            const weAreOpponent = w.opponent?.tag === tag;
            return {
                ...w,
                clan: weAreOpponent ? w.opponent : w.clan,
                opponent: weAreOpponent ? w.clan : w.opponent,
                attacksPerMember: 1, // CWL: one attack per member
                __round: x.round,
                __warTag: x.warTag,
                __season: x.season,
            };
        })
        .sort((a, b) => a.__round - b.__round);
};

// Stars and attacks of our members across the CWL rounds of the latest saved season.
// A round only counts for a member once it ended or the member already attacked.
export const getCwlMemberStats = () => {
    const stats = new Map();
    getCwlRounds().forEach((w) => {
        const ended = ['warEnded', 'ended'].includes(w.state);
        (w.clan?.members || []).forEach((m) => {
            const attacks = m.attacks || [];
            if (!ended && !attacks.length) return;
            const s = stats.get(m.tag) || {
                tag: m.tag, name: m.name, th: m.townhallLevel ?? m.townHallLevel,
                stars: 0, attacks: 0, rounds: 0,
            };
            s.rounds++;
            s.attacks += attacks.length;
            s.stars += attacks.reduce((n, a) => n + (a.stars || 0), 0);
            stats.set(m.tag, s);
        });
    });
    return stats;
};

// All raid weekends; falls back to the latest one while the full list is still loading
export const getRaidWeeks = () => (state.raids.length ? state.raids : (state.raid ? [state.raid] : []));
