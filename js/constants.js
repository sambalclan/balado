export const roleMap = { leader: 'Leader', coLeader: 'CoLead', admin: 'Elder', member: 'Member' };
export const roleWeight = { leader: 4, coLeader: 3, admin: 2, member: 1 };
export const roleName = (role) => roleMap[role] || role;
export const getTHImage = (lv) => `assets/Town_Hall${lv}.webp`;
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
    return String(value ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

// YYYY-MM-DD from a war's end/start time or its data file name
export function warDate(w) {
    const raw = w.endTime || w.startTime || w.preparationStartTime || w.__file || '';
    const m = String(raw).match(/(\d{4})-?(\d{2})-?(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

// Sliding "pill" behind the active button of a segmented control.
// The container must be `relative grid gap-1 p-1`, with the buttons `relative z-10`.
const lastIdx = {}; // last rendered position per pill id, so a re-render can slide from it

export const pillHtml = (id, cols, idx) => {
    const from = lastIdx[id] ?? idx;
    const gaps = 0.5 + (cols - 1) * 0.25; // padding (p-1 x2) + gaps (gap-1)
    return `<span id="${id}" class="absolute top-1 bottom-1 left-1 rounded-lg bg-[#2A2410] border border-[#6B5A1E] pointer-events-none"
                  style="width:calc((100% - ${gaps}rem) / ${cols}); transform:translateX(calc(${from} * (100% + 0.25rem)))"></span>`;
};

// Call after the HTML is in the DOM
export const slidePill = (root, id, idx) => {
    const pill = root.querySelector('#' + id);
    const from = lastIdx[id] ?? idx;
    lastIdx[id] = idx;
    if (!pill || from === idx) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        pill.style.transition = 'transform 220ms cubic-bezier(.4,0,.2,1)';
        pill.style.transform = `translateX(calc(${idx} * (100% + 0.25rem)))`;
    }));
};
