// Shared UI helpers for the 1.5.2 interaction model (accordion rows, ride sheet, time picker).
export async function expand(page, name) {
  const row = page.locator(`.ex-card:has(h2:text-is("${name}"))`).first();
  if (!(await row.evaluate((el) => el.classList.contains('open')))) {
    await row.locator('.ex-head').click();
    await page.waitForTimeout(350);
  }
}
export async function addRide(page, km, minutes = '', note = '') {
  await page.click('[data-action=ride-new]');
  await page.waitForSelector('.sheet [name=km]');
  await page.fill('.sheet [name=km]', String(km));
  if (minutes !== '') await page.fill('.sheet [name=minutes]', String(minutes));
  if (note) await page.fill('.sheet [name=note]', note);
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(350);
}
/** Scroll the picker wheels to HH:MM (like a user would), then confirm. */
export async function pickTime(page, triggerSelector, hhmm) {
  await page.click(triggerSelector);
  await page.waitForSelector('.tp-wheel');
  await page.waitForTimeout(350);
  const [h, m] = hhmm.split(':').map(Number);
  await page.evaluate(([h, m]) => {
    const set = (sel, i) => { const w = document.querySelector(sel); w.style.scrollBehavior = 'auto'; w.scrollTop = i * 48; w.dispatchEvent(new Event('scroll')); };
    const mins = [...document.querySelectorAll('[data-wheel=m] .tp-item')].map((el) => Number(el.textContent));
    set('[data-wheel=h]', h);
    set('[data-wheel=m]', mins.indexOf(m));
  }, [h, m]);
  await page.waitForTimeout(250);
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(350);
}
/** Per-set sheet (1.6.5): step reps to the wanted value and type the weight (0 = bodyweight). Does not save. */
export async function fillSetSheet(page, { reps, weight } = {}) {
  await page.waitForSelector('.sheet [data-reps-val]');
  await page.waitForTimeout(350);
  if (reps !== undefined) {
    for (let guard = 0; guard < 400; guard++) {
      const cur = Number(await page.textContent('.sheet [data-reps-val]'));
      if (cur === reps) break;
      await page.click(`.sheet [data-step="reps:${cur < reps ? 1 : -1}"]`);
    }
  }
  if (weight !== undefined) await page.fill('.sheet [data-w-val]', String(weight));
}
/** Long-press a set chip of the open exercise row. */
export async function longPressSet(page, i) {
  const chip = page.locator(`.ex-card.open [data-action=set][data-i="${i}"]`);
  await chip.scrollIntoViewIfNeeded();
  const box = await chip.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
}
