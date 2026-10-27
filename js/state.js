// Data shared between the pages (About, Members, War, Raid)
export const state = {
    clan: null,
    war: null,      // latest war
    wars: [],       // all wars (newest first)
    raid: null,     // latest raid weekend
    raids: [],      // all raid weekends (newest first)
    cwl: null,      // latest Clan War League season
    history: [],    // members per day
};

export const setWarData = (war) => { state.war = war; };
export const setRaidData = (raid) => { state.raid = raid || null; };
export const setRaids = (raids) => { state.raids = raids || []; };
export const setCwlData = (cwl) => { state.cwl = cwl || null; };
export const setClanHistory = (history) => { state.history = history || []; };
