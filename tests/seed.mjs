// Rich deterministic history used by screenshots and the insights tests.
export function seedState(today = new Date()) {
  const k = (i) => { const d = new Date(today); d.setDate(d.getDate() - i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const days = {};
  for (let i = 1; i <= 40; i++) {
    if (i % 9 === 0) { days[k(i)] = { rest: true, steps: 4000, climbs: [], rides: [], exercises: {}, food: [], sleep: { bed: '23:30', wake: '07:30' }, water: [] }; continue; }
    days[k(i)] = {
      rest: false, steps: 8000 + (i * 997) % 7000,
      climbs: Array.from({ length: 2 + (i % 5) }, (_, j) => ({ type: j === 0 ? 'roof' : 'regular', floors: j === 0 ? 10 : 6 })),
      rides: i % 4 === 0 ? [{ km: 20 + (i % 15), minutes: 60, note: '' }] : [],
      exercises: {
        e1: { sets: [1, 2, 3].map((s) => ({ reps: 15 + (i % 6), weight: 6, done: true })) },
        e2: { seconds: 40 + (i % 30), weight: null },
      },
      food: [
        { name: 'ביצה קשה', grams: 110, kcal: 171, protein: 13.9, source: 'db', time: '08:10', amount: 2, unit: 'יחידה' },
        { name: 'חזה עוף צלוי', grams: 200, kcal: 330, protein: 62, source: 'db', time: '13:30', amount: 200, unit: 'גרם' },
        { name: 'במבה', grams: 80, kcal: 427, protein: 12.4, source: 'db', time: '21:00', amount: 1, unit: 'שקית' },
      ],
      sleep: { bed: '23:' + String(10 + (i % 40)).padStart(2, '0'), wake: '06:50' },
      water: Array.from({ length: 4 + (i % 6) }, () => ({ ml: 250, time: '10:00' })),
    };
  }
  days[k(0)] = {
    rest: false, steps: 9400, climbs: [{ type: 'regular', floors: 6 }, { type: 'roof', floors: 10 }], rides: [],
    exercises: { e1: { sets: [{ reps: 20, weight: 6, done: true }, { reps: 18, weight: 6, done: true }] } },
    food: [{ name: 'ביצה קשה', grams: 110, kcal: 171, protein: 13.9, source: 'db', time: '08:10', amount: 2, unit: 'יחידה' },
      { name: 'סמבוסק בוכרי עם בשר', grams: 180, kcal: 540, protein: 18, source: 'db', time: '13:00', amount: 2, unit: 'יחידה' }],
    sleep: { bed: '23:40', wake: '06:30' }, water: [{ ml: 250, time: '08:00' }, { ml: 500, time: '12:00' }],
  };
  return {
    schemaVersion: 4,
    settings: { coach: { enabled: false }, theme: 'flame', startWeight: 96, targetWeight: 85, height: 180, proteinTarget: 150, stepsTarget: 12000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 },
    exercises: [
      { id: 'e1', name: 'שכיבות סמיכה', type: 'setsReps', sets: 3, reps: 20, seconds: null, weight: 6, order: 0, archived: false },
      { id: 'e2', name: 'פלאנק', type: 'timed', sets: null, reps: null, seconds: 60, weight: null, order: 1, archived: false },
      { id: 'e3', name: 'מתח', type: 'maxReps', sets: null, reps: 10, seconds: null, weight: null, order: 2, archived: false },
    ],
    mealPresets: [{ id: 'm1', name: 'שייק חלבון', kcal: 250, protein: 40 }, { id: 'm2', name: 'יוגורט וגרנולה', kcal: 320, protein: 14 }],
    customFoods: [{ id: 'c1', name: 'גבינה של סבתא', barcode: null, kcal100: 200, protein100: 12, servingGrams: null }],
    foodMemory: {}, days,
    weights: [{ date: k(20), kg: 95.2 }, { date: k(13), kg: 94.6 }, { date: k(10), kg: 94.3 }, { date: k(6), kg: 93.9 }, { date: k(2), kg: 93.5 }],
    meta: { lastSeenLevel: 99, seenBadges: ['first', 'streak7', 'proteinWeek'] },
  };
}
