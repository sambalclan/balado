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