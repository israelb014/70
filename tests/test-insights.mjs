// Exact-text tests for js/insights.js (Node, no browser). Each case seeds a minimal history.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const R = `${process.env.REPO_ROOT}/js/`;
const S = await import(R + 'storage.js');
const I = await import(R + 'insights.js');
const D = await import(R + 'dates.js');
const E = await import(R + 'export.js');
const T = D.todayKey();
const k = (i) => D.addDays(T, -i);
let fails = 0, passes = 0;
const ok = (cond, label, extra = '') => { if (cond) passes++; else { fails++; console.log('FAIL', label, extra); } };

const SETTINGS = { coach: { enabled: false }, startWeight: 96, targetWeight: 85, proteinTarget: 150, stepsTarget: 12000, rideGoalKm: 45, climbsTarget: 6, floorsRegular: 6, floorsRoof: 10, sleepTarget: 8, waterTarget: 2500 };
const EXS = [
  { id: 'e1', name: 'שכיבות סמיכה', type: 'setsReps', sets: 3, reps: 20, seconds: null, weight: null, order: 0, archived: false },
  { id: 'e2', name: 'פלאנק', type: 'timed', sets: null, reps: null, seconds: 60, weight: null, order: 1, archived: false },
];
const blank = () => ({ rest: false, steps: null, climbs: [], rides: [], exercises: {}, food: [], sleep: null, water: [] });
const F = (name, kcal, protein, time) => ({ name, kcal, protein, ...(time ? { time } : {}) });
function seed(days, extra = {}) {
  const full = {};
  for (const [key, d] of Object.entries(days)) full[key] = { ...blank(), ...d };
  S.replaceState({ schemaVersion: 4, settings: SETTINGS, exercises: EXS, mealPresets: [], customFoods: [], foodMemory: {}, days: full, weights: [], meta: { lastSeenLevel: 1, seenBadges: [] }, ...extra });
}
const texts = (list) => list.map((x) => x.text);
const has = (list, text, label) => ok(texts(list).includes(text), label, `\n   want: ${text}\n   got:  ${JSON.stringify(texts(list))}`);
const hasNo = (list, id, label) => ok(!list.some((x) => x.id === id || x.id.startsWith(id + ':')), label, JSON.stringify(texts(list)));

/* ---------------- day scope ---------------- */
// D1 calories vs average
const prevFood = (n, kcal) => Object.fromEntries(Array.from({ length: n }, (_, i) => [k(i + 1), { food: [F('ארוחה', kcal, 100)] }]));
seed({ ...prevFood(4, 1500), [T]: { food: [F('ארוחה', 2140, 100)] } });
has(I.dayInsights(T), 'היום אכלת 640 קק״ל מעל הממוצע השבועי שלך', 'D1 above average');
seed({ ...prevFood(4, 1500), [T]: { food: [F('ארוחה', 1100, 100)] } });
has(I.dayInsights(T), 'היום אכלת 400 קק״ל פחות מהממוצע השבועי שלך', 'D1 below average');
seed({ ...prevFood(3, 1500), [T]: { food: [F('ארוחה', 2140, 100)] } });
hasNo(I.dayInsights(T), 'kcalAvg', 'D1 hidden with only 3 previous days');
seed({ ...prevFood(4, 1500), [T]: { food: [F('ארוחה', 1790, 100)] } });
hasNo(I.dayInsights(T), 'kcalAvg', 'D1 hidden when diff < 300');

// D2 biggest item
seed({ [T]: { food: [F('סמבוסק בוכרי עם בשר', 400, 20), F('סלט', 300, 10), F('לחם', 300, 10)] } });
has(I.dayInsights(T), '40% מהקלוריות של היום הגיעו מסמבוסק בוכרי עם בשר', 'D2 biggest item');
seed({ [T]: { food: [F('א', 250, 20), F('ב', 250, 20), F('ג', 250, 20), F('ד', 250, 20)] } });
hasNo(I.dayInsights(T), 'bigItem', 'D2 hidden below 30%');
seed({ [T]: { food: [F('א', 900, 20)] } });
hasNo(I.dayInsights(T), 'bigItem', 'D2 hidden with a single item');

// D3 low-protein calories
seed({ [T]: { food: [F('במבה', 620, 10), F('חזה עוף', 1000, 100)] } });
has(I.dayInsights(T), '620 קק״ל היום הגיעו ממזונות דלי חלבון', 'D3 low protein');
seed({ [T]: { food: [F('במבה', 200, 3), F('חזה עוף', 1000, 100)] } });
hasNo(I.dayInsights(T), 'lowProtein', 'D3 hidden below 25%');

// D4 late eating
seed({ [T]: { food: [F('בוקר', 500, 30, '08:00'), F('ערב', 500, 30, '21:00'), F('בלי שעה', 2000, 30)] } });
has(I.dayInsights(T), '50% מהקלוריות היום נאכלו אחרי 20:00', 'D4 late eating (untimed excluded)');
seed({ [T]: { food: [F('בוקר', 660, 30, '08:00'), F('ערב', 340, 30, '20:30')] } });
hasNo(I.dayInsights(T), 'late', 'D4 hidden at 34%');

// D5 protein target
seed({ [T]: { food: [F('א', 1000, 160)] } });
has(I.dayInsights(T), 'עמדת ביעד החלבון: 160 מתוך 150 גרם', 'D5 met');
seed({ [T]: { food: [F('א', 1000, 118.3)] } });
has(I.dayInsights(T), 'חסרים 32 גרם חלבון ליעד היומי', 'D5 missed');
seed({ [T]: { steps: 100 } });
hasNo(I.dayInsights(T), 'protein', 'D5 hidden without food');

// D6 near record, D7 new record
const water = (ml) => [{ ml, time: '10:00' }];
const climbs = (n) => Array.from({ length: n }, () => ({ type: 'regular', floors: 6 }));
const sets = (...reps) => ({ sets: reps.map((r) => ({ reps: r, weight: null, done: true })) });
seed({ [k(3)]: { exercises: { e1: sets(20), e2: { seconds: 50 } } }, [k(2)]: { exercises: { e1: sets(22), e2: { seconds: 60 } } }, [T]: { exercises: { e1: sets(20, 18), e2: { seconds: 59 } } } });
let L = I.dayInsights(T);
has(L, 'עוד 2 חזרות לשיא שלך בשכיבות סמיכה', 'D6 near record (reps)');
has(L, 'עוד שנייה אחת לשיא שלך בפלאנק', 'D6 near record (seconds, singular)');
seed({ [k(2)]: { exercises: { e1: sets(22) } }, [T]: { exercises: { e1: sets(19) } } });
hasNo(I.dayInsights(T), 'nearRecord', 'D6 hidden when > 10% away');
seed({ [k(2)]: { exercises: { e1: sets(22) } }, [T]: { exercises: { e1: sets(25) } } });
L = I.dayInsights(T);
has(L, 'שיא חדש בשכיבות סמיכה: 25 חזרות בסט', 'D7 new record');
hasNo(L, 'nearRecord', 'D7 a new record is not also "near"');
seed({ [T]: { exercises: { e1: sets(25) } } });
hasNo(I.dayInsights(T), 'newRecord', 'D7 hidden for the first-ever value');
// D7 every record kind, natural wording
const wsets = (reps, w) => ({ sets: [{ reps, weight: w, done: true }] });
seed({ [k(3)]: { exercises: { e1: wsets(20, 6), e2: { seconds: 60 } }, rides: [{ km: 30 }], steps: 15000, climbs: climbs(5) },
  [T]: { exercises: { e1: wsets(20, 8), e2: { seconds: 75 } }, rides: [{ km: 32.5 }], steps: 16200, climbs: climbs(7) } });
L = I.dayInsights(T);
has(L, 'שיא חדש בשכיבות סמיכה: 8 ק״ג', 'D7 weight record');
has(L, 'שיא חדש בפלאנק: 75 שניות', 'D7 hold record');
has(L, 'שיא חדש ברכיבה: 32.5 ק״מ', 'D7 ride record');
has(L, 'שיא חדש בצעדים: 16,200 צעדים ביום', 'D7 steps record');
has(L, 'שיא חדש במדרגות: 42 קומות ביום', 'D7 climbs record (floors)');
ok(!texts(L).some((t) => t.includes('·') || t.includes('—')), 'D7 no "label · unit — value" leftovers', JSON.stringify(texts(L)));
// Non-Hebrew exercise names get "ב-"
S.replaceState({ ...S.getState(), exercises: [{ ...EXS[0], name: 'TRX' }, EXS[1]] });
has(I.dayInsights(T), 'שיא חדש ב-TRX: 8 ק״ג', 'D7 non-Hebrew name → "ב-"');

// D8 sleep
const sl = (bed, wake) => ({ sleep: { bed, wake } });
seed({ [k(1)]: sl('23:00', '07:20'), [k(2)]: sl('23:00', '07:20'), [k(3)]: sl('23:00', '07:20'), [T]: sl('23:30', '06:50') });
L = I.dayInsights(T);
has(L, 'ישנת 7:20 שעות הלילה, 40 דקות פחות מהיעד', 'D8 below target');
has(L, 'ישנת שעה אחת פחות מהממוצע השבועי שלך', 'D8 vs 7-day average');
seed({ [k(1)]: sl('23:00', '07:20'), [k(2)]: sl('23:00', '07:20'), [T]: sl('22:50', '07:00') });
L = I.dayInsights(T);
has(L, 'ישנת 8:10 שעות הלילה ועמדת ביעד השינה', 'D8 met');
hasNo(L, 'sleepAvg', 'D8 average hidden with only 2 previous nights');
seed({ [k(1)]: sl('23:00', '07:00'), [k(2)]: sl('23:00', '07:00'), [k(3)]: sl('23:00', '07:00'), [T]: sl('23:30', '07:00') });
hasNo(I.dayInsights(T), 'sleepAvg', 'D8 average hidden when diff < 45 min');

// D9 targets
seed({ [T]: { steps: 12500, climbs: climbs(6), food: [F('א', 1500, 150)], water: water(2500), exercises: { e1: sets(20, 20, 20), e2: { seconds: 60 } } } });
has(I.dayInsights(T), 'עמדת בכל היעדים היומיים: צעדים, מדרגות, חלבון, מים ותרגילים', 'D9 all targets');
seed({ [T]: { steps: 12500, water: water(2600) } });
has(I.dayInsights(T), 'עמדת היום ביעדים: צעדים ומים', 'D9 some targets');
seed({ [T]: { steps: 12500 } });
hasNo(I.dayInsights(T), 'targets', 'D9 hidden with a single target');

// Ordering by priority
seed({ [k(2)]: { exercises: { e1: sets(22) } }, [T]: { steps: 12500, climbs: climbs(6), food: [F('א', 1500, 150)], water: water(2500), exercises: { e1: sets(25, 20, 20), e2: { seconds: 60 } } } });
L = I.dayInsights(T);
ok(L[0].id.startsWith('newRecord') && L[1].id === 'allTargets', 'ordering: record (90) then all targets (85)', JSON.stringify(L.map((x) => `${x.priority}:${x.id}`)));
ok(L.every((x, i) => i === 0 || L[i - 1].priority >= x.priority), 'ordering: priorities non-increasing');

/* ---------------- week scope ---------------- */
const range = (from, to, fn) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, j) => [k(from + j), fn(from + j)]));
// W1 week over week
seed({ ...range(0, 6, () => ({ steps: 11000 })), ...range(7, 13, () => ({ steps: 10000 })) });
has(I.weekInsights(), 'ממוצע הצעדים היומי עלה ב-10% לעומת השבוע הקודם', 'W1 steps up');
seed({ ...range(0, 6, () => ({ steps: 11000 })), ...range(7, 9, () => ({ steps: 10000 })) });
hasNo(I.weekInsights(), 'wow:steps', 'W1 hidden with 3 days in the previous week');
seed({ ...range(0, 6, () => ({ steps: 10900 })), ...range(7, 13, () => ({ steps: 10000 })) });
hasNo(I.weekInsights(), 'wow:steps', 'W1 hidden at 9%');
seed({ ...range(0, 6, () => ({ sleep: { bed: '23:00', wake: '06:00' } })), ...range(7, 13, () => ({ sleep: { bed: '23:00', wake: '07:00' } })) });
has(I.weekInsights(), 'ממוצע השינה ירד מ-8:00 ל-7:00 שעות לעומת השבוע הקודם', 'W1 sleep down (attention)');
ok(I.weekInsights().find((x) => x.id === 'wow:sleep')?.kind === 'attention', 'W1 decrease kind = attention');
seed({ ...range(0, 6, () => ({ exercises: { e1: sets(20), e2: { seconds: 60 } } })), ...range(7, 13, () => ({ exercises: { e1: sets(20, 20, 20), e2: { seconds: 60 } } })) });
has(I.weekInsights(), 'השלמת האימונים ירדה מ-100% ל-67% לעומת השבוע הקודם', 'W1 completion shows values, not % of %');

// W2 + W3 sleep correlations
const shortDay = { sleep: { bed: '01:00', wake: '06:00' }, food: [F('א', 2500, 100)], exercises: { e1: sets(20), e2: { seconds: 30 } } };
const goodDay = { sleep: { bed: '23:00', wake: '07:00' }, food: [F('א', 2200, 100)], exercises: { e1: sets(20, 20, 20), e2: { seconds: 60 } } };
seed({ [k(20)]: shortDay, [k(21)]: shortDay, [k(22)]: shortDay, [k(23)]: goodDay, [k(24)]: goodDay, [k(25)]: goodDay });
L = I.weekInsights();
has(L, 'בימים שאחרי לילה של פחות מ-6 שעות שינה אכלת בממוצע 300 קק״ל יותר', 'W2 sleep → calories');
// short: e1 1/3 + e2 30/60 → (0.333+0.5)/2 = 42%; good: 100%
has(L, 'אחרי 7 שעות שינה ומעלה השלמת בממוצע 100% מהאימון, לעומת 42% אחרי פחות מ-6 שעות', 'W3 sleep → workout');
seed({ [k(20)]: shortDay, [k(21)]: shortDay, [k(23)]: goodDay, [k(24)]: goodDay, [k(25)]: goodDay });
L = I.weekInsights();
hasNo(L, 'sleepKcal', 'W2 hidden with 2 short nights');
hasNo(L, 'sleepWorkout', 'W3 hidden with 2 short nights');

// W4 weakest weekday
const days28 = {};
for (let i = 0; i < 28; i++) days28[k(i)] = { food: [F('א', 1800, D.parseKey(k(i)).getDay() === 0 ? 100 : 150)] };
seed(days28);
has(I.weekInsights(), 'ימי ראשון הם הימים עם הכי מעט חלבון: 43 גרם פחות מהממוצע שלך', 'W4 weakest weekday');
for (let i = 0; i < 28; i++) days28[k(i)] = { food: [F('א', 1800, D.parseKey(k(i)).getDay() === 0 ? 135 : 150)] };
seed(days28);
hasNo(I.weekInsights(), 'weakDay', 'W4 hidden when < 20 g below');

// W5 top sources + low density
seed(range(0, 2, () => ({ food: [F('במבה', 430, 13), F('חזה עוף צלוי', 330, 62), F('ביצה קשה', 170, 14), F('תפוח', 50, 0.3)] })));
L = I.weekInsights();
has(L, 'מקורות הקלוריות הגדולים השבוע: במבה (1,290 קק״ל), חזה עוף צלוי (990 קק״ל) וביצה קשה (510 קק״ל)', 'W5 top sources');
has(L, '44% מהקלוריות של השבוע הגיעו מבמבה, מזון דל חלבון', 'W5 low-density food');
seed(range(0, 1, () => ({ food: [F('במבה', 430, 13), F('חזה עוף צלוי', 330, 62)] })));
hasNo(I.weekInsights(), 'topSources', 'W5 hidden with only 2 food days');

// W6 weight
seed({}, { weights: [{ date: k(1), kg: 93.0 }, { date: k(4), kg: 92.8 }, { date: k(8), kg: 94.0 }, { date: k(11), kg: 93.6 }] });
has(I.weekInsights(), 'המשקל הממוצע ירד ב-0.9 ק״ג לעומת השבוע הקודם', 'W6 weight');
ok(I.weekInsights().find((x) => x.id === 'weight')?.kind === 'positive', 'W6 toward target = positive');
seed({}, { weights: [{ date: k(1), kg: 93.0 }, { date: k(8), kg: 94.0 }, { date: k(11), kg: 93.6 }] });
hasNo(I.weekInsights(), 'weight', 'W6 hidden with 1 weigh-in this week');

// W7 progression
seed({ [k(30)]: { exercises: { e1: sets(20), e2: { seconds: 50 } } }, [k(2)]: { exercises: { e1: sets(22), e2: { seconds: 54 } } } });
L = I.weekInsights();
has(L, 'שיפור של 10% בשכיבות סמיכה לעומת לפני 4 שבועות', 'W7 progression');
hasNo(L, 'progress:e2', 'W7 hidden below 10% (plank +8%)');

// W8 consistency
seed({ ...range(0, 4, () => ({ steps: 12500, water: water(500) })), ...range(5, 6, () => ({ steps: 3000, water: water(2600) })) });
L = I.weekInsights();
has(L, 'עמדת ביעד הצעדים ב-5 מתוך 7 הימים האחרונים', 'W8 consistency positive');
has(L, 'יעד המים הושג ב-2 מתוך 7 הימים האחרונים', 'W8 consistency attention');
hasNo(L, 'consistency:climbs', 'W8 untracked target is not mentioned');

// W9 streak milestone
seed(range(0, 6, () => ({ rest: true })));
has(I.weekInsights(), 'הגעת השבוע לרצף של 7 ימים', 'W9 streak milestone');
seed(range(0, 5, () => ({ rest: true })));
hasNo(I.weekInsights(), 'streak', 'W9 hidden for a 6-day streak');

// Week ordering
seed({ ...range(0, 6, () => ({ rest: true, steps: 11000 })), ...range(7, 13, () => ({ steps: 10000 })) });
L = I.weekInsights();
ok(L[0].id === 'streak:7' && L.every((x, i) => i === 0 || L[i - 1].priority >= x.priority), 'week ordering by priority', JSON.stringify(L.map((x) => `${x.priority}:${x.id}`)));

/* ---------------- exports ---------------- */
seed({ ...prevFood(4, 1500), [k(2)]: { food: [F('ארוחה', 1500, 100)], exercises: { e1: sets(22) } },
  [T]: { steps: 12500, climbs: climbs(6), food: [F('במבה', 900, 15, '21:30'), F('חזה', 1240, 150, '13:00')], water: water(2500), exercises: { e1: sets(25, 20, 20), e2: { seconds: 60 } }, sleep: { bed: '23:30', wake: '06:50' } } });
let txt = E.dailySummary(T);
const lines = txt.split('\n');
const iIns = lines.indexOf('תובנות:');
const iXp = lines.findIndex((l) => l.includes('XP היום'));
const bullets = [];
for (let i = iIns + 1; i < lines.length && lines[i].startsWith('• '); i++) bullets.push(lines[i]);
ok(iIns > 0 && iXp === iIns + bullets.length + 2 && lines[iIns - 1] === '', 'daily export: "תובנות:" section right before the XP line', txt);
ok(bullets.length === 4, 'daily export: max 4 insights', JSON.stringify(bullets));
const top4 = I.dayInsights(T).slice(0, 4).map((x) => `• ${x.text}`);
ok(JSON.stringify(bullets) === JSON.stringify(top4), 'daily export: sorted by priority');
seed({ [T]: { steps: 100 } });
ok(!E.dailySummary(T).includes('תובנות'), 'daily export: no section without insights');

seed({ ...range(0, 6, () => ({ rest: true, steps: 11000, food: [F('א', 1800, 160)] })), ...range(7, 13, () => ({ steps: 10000, food: [F('א', 1800, 140)] })) });
txt = E.weeklySummary();
const wl = txt.split('\n');
const iW = wl.indexOf('תובנות השבוע:');
const iLvl = wl.findIndex((l) => l.startsWith('רמה נוכחית'));
const wb = [];
for (let i = iW + 1; i < wl.length && wl[i].startsWith('• '); i++) wb.push(wl[i]);
ok(iW > 0 && iLvl === iW + wb.length + 2, 'weekly export: "תובנות השבוע:" before the level line', txt.slice(-600));
ok(wb.length >= 1 && wb.length <= 6, 'weekly export: 1–6 insights', JSON.stringify(wb));
ok(JSON.stringify(wb) === JSON.stringify(I.weekInsights().slice(0, 6).map((x) => `• ${x.text}`)), 'weekly export: sorted by priority');
seed({});
ok(!E.weeklySummary().includes('תובנות השבוע'), 'weekly export: no section without insights');

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
