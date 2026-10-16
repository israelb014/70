// Badge medallions: hand-drawn inline SVG per badge family, accent when earned, grey when locked.

const ICONS = {
  first: '<path d="M4 11v4M7 9v8M17 9v8M20 11v4M7 13h10"/><path d="M12 2.5l1.1 2.1 2.3.3-1.7 1.6.4 2.3L12 7.7l-2.1 1.1.4-2.3-1.7-1.6 2.3-.3z" stroke-linejoin="round"/>',
  streak: '<path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3 1.8-5.1 3.4-6.8.3 1.8 1.2 3 2.4 3.6C10.6 7.8 12 5 14.5 3c.2 3.2 1.7 4.8 3 6.4 1 1.3 1.5 2.9 1.5 4.9C19 18.2 15.9 21 12 21z"/><path d="M12 18c-1.5 0-2.6-1-2.6-2.4 0-1.3 1-2.2 1.8-3 .3 1.2 1.3 1.6 2 1.4.9.6 1.4 1.4 1.4 2.1C14.6 17 13.5 18 12 18z"/>',
  weight: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M8.5 8.5a5 5 0 0 1 7 0"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5"/>',
  ride: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5L9 9h6.5l3 7.5M9 9l3.5 7.5h-7M14 5.5h2.5L18 9"/>',
  climbs: '<path d="M3 20h5v-4.5h4.5V11H17V6.5h4"/><path d="M5 11V4M2.5 6.5L5 4l2.5 2.5"/>',
  steps: '<path d="M8.5 3.5c1.7 0 2.7 1.8 2.5 4.2-.2 2-1 3.3-2.6 3.3S5.7 9.6 5.8 7.6C5.9 5.3 6.9 3.5 8.5 3.5zM6.3 14h4.6l-.4 2.6a2.3 2.3 0 0 1-4.5-.3zM15.5 8c1.7 0 2.7 1.8 2.6 4.2-.2 2-1 3.3-2.6 3.3s-2.7-1.4-2.6-3.4C13 9.8 14 8 15.5 8zM13.2 18.5h4.6l-.4 2.1a2.3 2.3 0 0 1-4.5-.3z"/>',
  pushups: '<circle cx="5" cy="8.5" r="1.8"/><path d="M7 10l12 3.5M9.5 10.8V17M17 13v4M2.5 19h19"/>',
  plank: '<circle cx="4.5" cy="10.5" r="1.8"/><path d="M6.5 12h13.5M7.5 12v4.5H11M20 12v4.5M2.5 19h19"/><path d="M15 3.5h4M17 3.5V6"/>',
  protein: '<path d="M12 3c3.6 0 6 5.4 6 9.5a6 6 0 0 1-12 0C6 8.4 8.4 3 12 3z"/><path d="M10 12.5h2.6a1.6 1.6 0 0 0 0-3.2H10V16"/>',
  sleep: '<path d="M18.5 14.5A7.5 7.5 0 0 1 9 5a7.5 7.5 0 1 0 9.5 9.5z"/><path d="M15.5 3.5h3l-3 3.5h3M19.5 8.5h2l-2 2.3h2"/>',
};

export const BADGE_ON = '#FF6A00';
export const BADGE_OFF = '#3A3F47';

/** Medallion SVG: ring, family icon and tier pill. */
export function medallion(badge, earned, size = 72) {
  const c = earned ? BADGE_ON : BADGE_OFF;
  const tierFill = earned ? BADGE_ON : '#2A2E35';
  const tierText = earned ? '#140800' : '#8A8F98';
  const w = Math.max(22, 9 + badge.tier.length * 7);
  return `<svg class="medal ${earned ? 'earned' : 'locked'}" width="${size}" height="${size}" viewBox="0 0 72 72" aria-hidden="true">
    <circle cx="36" cy="34" r="31" fill="${earned ? 'rgba(255,106,0,0.10)' : '#1A1D22'}" stroke="${c}" stroke-width="3"/>
    <circle cx="36" cy="34" r="25" fill="none" stroke="${c}" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="2 3"/>
    <g transform="translate(21 17) scale(1.25)" fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[badge.family] || ''}</g>
    <rect x="${36 - w / 2}" y="56" width="${w}" height="15" rx="7.5" fill="${tierFill}"/>
    <text x="36" y="67.2" text-anchor="middle" font-size="10.5" font-weight="900" fill="${tierText}" font-family="Heebo, system-ui, sans-serif" direction="ltr">${badge.tier}</text>
  </svg>`;
}
