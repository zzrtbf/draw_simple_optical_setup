import { chromium, webkit } from 'playwright-core';
import fs from 'node:fs';
import { findBrowser } from './browser-path.mjs';

/** PW_ENGINE=webkit runs the same checks on the engine Safari uses. */
const ENGINE = (process.env.PW_ENGINE || 'chromium').toLowerCase();
const EDGE = ENGINE === 'webkit' ? '' : findBrowser();
const URL = process.env.APP_URL || 'http://127.0.0.1:5180/';
const outDir = process.env.SHOT_DIR || '.tmp/v11';
fs.mkdirSync(outDir, { recursive: true });

if (ENGINE !== 'webkit' && !EDGE) {
  console.error('No Chromium-based browser found — set EDGE_PATH or CHROME_PATH.');
  process.exit(1);
}

/** Keyboard modifier the app expects on this platform. */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

const browser =
  ENGINE === 'webkit'
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

const state = () =>
  page.evaluate(() => {
    const s = window.__editor.getState();
    return {
      items: s.project.items.map((i) => ({
        id: i.id,
        kind: i.kind,
        lib: i.lib,
        x: i.x,
        y: i.y,
        labelOffset: i.labelOffset,
        snap: i.snap,
        showLabel: i.showLabel,
        workingDistance: i.workingDistance,
        split: i.split,
        autoBeams: i.autoBeams,
      })),
      beams: s.project.beams.map((b) => ({
        id: b.id,
        x1: b.x1,
        y1: b.y1,
        x2: b.x2,
        y2: b.y2,
        snap: b.snap,
        bakedFrom: b.bakedFrom,
      })),
      board: s.project.board,
      selection: s.selection,
    };
  });

await page.goto(URL + '?demo', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

/* ---- objective part exists ---- */
const objectiveImg = page.locator('.pal-item', { hasText: 'Objective Lens' });
check('objective lens is in the library', (await objectiveImg.count()) === 1);
await objectiveImg.first().click();
await page.waitForTimeout(200);
let st = await state();
check('objective can be placed', st.items.some((i) => i.lib === 'x-objective'));

const wdInput = page
  .locator('.numfield')
  .filter({ has: page.locator('.nf-label', { hasText: /^WD$/ }) })
  .locator('input');
check('objective inspector exposes a working distance', (await wdInput.count()) === 1);
await wdInput.fill('35');
await page.waitForTimeout(200);
st = await state();
const obj = st.items.find((i) => i.lib === 'x-objective');
check('objective working distance can be typed', Math.abs(obj.workingDistance - 35) < 1e-6, `${obj.workingDistance}`);
await page.keyboard.press('Delete');
await page.waitForTimeout(100);

/* ---- beamsplitter: manual transmission ratio ---- */
await page.evaluate(() => window.__editor.getState().select(['s5']));
await page.waitForTimeout(250);
const tInput = page
  .locator('.numfield')
  .filter({ has: page.locator('.nf-label', { hasText: /^T$/ }) })
  .locator('input');
check('splitter inspector exposes a transmission ratio', (await tInput.count()) === 1);
await tInput.fill('90');
await page.waitForTimeout(250);
st = await state();
check(
  'transmission ratio can be typed',
  Math.abs(st.items.find((i) => i.id === 's5').split - 0.9) < 1e-6,
  `${st.items.find((i) => i.id === 's5').split}`,
);
await page.evaluate(() => window.__editor.getState().select([]));

/* ---- auto tracing <-> hand-drawn ---- */
await page.evaluate(() => window.__editor.getState().select(['s1']));
await page.waitForTimeout(250);
const autoToggle = page.locator('.toggle', { hasText: 'Auto beams' }).first();
check('light source exposes an auto/hand-drawn switch', (await autoToggle.count()) === 1);
const autoCount = () =>
  page.evaluate(() => document.querySelectorAll('[data-auto-beams] [data-auto-beam^="s1:"]').length);
check('auto tracing is on by default', (await autoCount()) > 0);
await autoToggle.click();
await page.waitForTimeout(250);
st = await state();
check(
  'switching auto off stops tracing this source',
  st.items.find((i) => i.id === 's1').autoBeams === false && (await autoCount()) === 0,
);
await autoToggle.click();
await page.waitForTimeout(250);
check('switching auto back on restores the path', (await autoCount()) > 0);

await page.locator('button', { hasText: 'Convert to hand-drawn' }).click();
await page.waitForTimeout(350);
st = await state();
const bakedIds = st.beams.filter((b) => b.bakedFrom === 's1').map((b) => b.id);
check(
  'convert copies the path into editable beams',
  bakedIds.length > 0 && st.items.find((i) => i.id === 's1').autoBeams === false,
  `${bakedIds.length} segments`,
);
check(
  'converted beams snap to the hole grid by default',
  st.beams.filter((b) => b.bakedFrom === 's1').every((b) => b.snap),
);

await page.evaluate(() => window.__editor.getState().select(['s1']));
await page.waitForTimeout(200);
await page.locator('.toggle', { hasText: 'Auto beams' }).first().click();
await page.waitForTimeout(300);
const hiddenBaked = await page.evaluate(
  (ids) => ids.filter((id) => !document.querySelector(`[data-world] g[data-id="${id}"]`)).length,
  bakedIds,
);
check(
  'the hand-drawn copy hides while auto is on',
  hiddenBaked === bakedIds.length,
  `${hiddenBaked}/${bakedIds.length} hidden`,
);

await page.locator('button', { hasText: 'Convert to hand-drawn' }).click();
await page.waitForTimeout(350);
st = await state();
const bakedAgain = st.beams.filter((b) => b.bakedFrom === 's1');
check(
  're-baking refreshes instead of stacking',
  bakedAgain.length === bakedIds.length,
  `${bakedAgain.length} vs ${bakedIds.length}`,
);
/* ---- two beams: align + bulk snap ---- */
await page.evaluate(() => window.__editor.getState().select(['sb3', 'sb4']));
await page.waitForTimeout(250);
await page.locator('button', { hasText: 'Top' }).click();
await page.waitForTimeout(250);
st = await state();
const b3 = st.beams.find((b) => b.id === 'sb3');
const b4 = st.beams.find((b) => b.id === 'sb4');
check(
  'align top moves the beams too',
  Math.min(b3.y1, b3.y2) === Math.min(b4.y1, b4.y2),
  `sb3 y ${b3.y1}/${b3.y2}, sb4 y ${b4.y1}/${b4.y2}`,
);
const beamSnap = page.locator('.toggle', { hasText: 'Snap beams to hole grid' }).first();
await beamSnap.click();
await page.waitForTimeout(250);
st = await state();
check(
  'bulk snap switch updates every selected beam',
  st.beams.filter((b) => b.id === 'sb3' || b.id === 'sb4').every((b) => b.snap === false),
);
await page.evaluate(() => window.__editor.getState().select([]));

/* ---- white bench theme ---- */
await page.locator('.segmented button', { hasText: 'White bench' }).first().click();
await page.waitForTimeout(300);
st = await state();
check('white bench switches the theme', st.board.theme === 'light');
await page.screenshot({ path: `${outDir}/light.png` });

/* text ink should flip on the light bench */
const textFill = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-stage] text')].find((t) => t.textContent?.includes('Demo layout'));
  return el ? getComputedStyle(el).fill : null;
});
check('text ink adapts on white bench', textFill && textFill !== 'rgb(159, 180, 201)', textFill);
await page.locator('.segmented button', { hasText: 'Dark bench' }).first().click();
await page.waitForTimeout(200);

/* ---- label drag ---- */
await page.evaluate(() => window.__editor.getState().select(['s2']));
await page.waitForTimeout(150);
const lb = await page.locator('[data-label="s2"]').boundingBox();
check('label has a drag target', !!lb);
await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
await page.mouse.down();
await page.mouse.move(lb.x + lb.width / 2 - 40, lb.y + lb.height / 2 - 30, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
st = await state();
const m1 = st.items.find((i) => i.id === 's2');
check('label can be moved', !!m1.labelOffset, JSON.stringify(m1.labelOffset));
await page.screenshot({ path: `${outDir}/label.png` });

/* labels must not rotate with the part */
const labelBox = await page.locator('[data-label="s2"]').boundingBox();
check('label box stays horizontal', labelBox.width > labelBox.height, `${labelBox.width.toFixed(0)}x${labelBox.height.toFixed(0)}`);

/* ---- Cmd (macOS) / Ctrl (Windows) + drag duplicates ---- */
const beforeCount = (await state()).items.length;
const laser = page.locator('[data-id="s1"]').first();
const lbox = await laser.boundingBox();
await page.keyboard.down(MOD);
await page.mouse.move(lbox.x + lbox.width / 2, lbox.y + lbox.height / 2);
await page.mouse.down();
await page.mouse.move(lbox.x + lbox.width / 2 + 120, lbox.y + lbox.height / 2 + 150, { steps: 10 });
await page.mouse.up();
await page.keyboard.up(MOD);
await page.waitForTimeout(200);
st = await state();
check('modifier + drag duplicates', st.items.length === beforeCount + 1, `${beforeCount} -> ${st.items.length}`);
const orig = st.items.find((i) => i.id === 's1');
check('original stays in place', orig.x === 95 && orig.y === 120, `${orig.x},${orig.y}`);
await page.keyboard.press('Delete');
await page.waitForTimeout(120);

/* ---- alt disables snapping ---- */
const block = page.locator('[data-id="s8"]').first();
const bbox = await block.boundingBox();
await page.keyboard.down('Alt');
await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
await page.mouse.down();
await page.mouse.move(bbox.x + bbox.width / 2 + 17, bbox.y + bbox.height / 2 + 11, { steps: 6 });
await page.mouse.up();
await page.keyboard.up('Alt');
await page.waitForTimeout(150);
st = await state();
const moved = st.items.find((i) => i.id === 's8');
check('alt + drag skips the grid', moved.x % 25 !== 0 || moved.y % 25 !== 0, `${moved.x},${moved.y}`);

/* ---- per-part snap switch ---- */
await page.locator('[data-id="s8"]').first().click();
await page.waitForTimeout(150);
const snapToggle = page.locator('.toggle', { hasText: 'Snap to hole grid' }).first();
check('inspector shows a per-part snap switch', (await snapToggle.count()) === 1);
await snapToggle.click();
await page.waitForTimeout(150);
st = await state();
check('snap switch turns off', st.items.find((i) => i.id === 's8').snap === false);

const bbox2 = await page.locator('[data-id="s8"]').first().boundingBox();
await page.mouse.move(bbox2.x + bbox2.width / 2, bbox2.y + bbox2.height / 2);
await page.mouse.down();
await page.mouse.move(bbox2.x + bbox2.width / 2 + 13, bbox2.y + bbox2.height / 2 + 7, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(150);
st = await state();
const moved2 = st.items.find((i) => i.id === 's8');
check('part with snap off moves freely', moved2.x % 25 !== 0 || moved2.y % 25 !== 0, `${moved2.x},${moved2.y}`);

/* ---- beam length / angle fields ---- */
await page.evaluate(() => window.__editor.getState().select(['sb1']));
await page.waitForTimeout(200);
const lenInput = page.locator('.numfield', { hasText: 'Length' }).locator('input').first();
check('beam length field exists', (await lenInput.count()) === 1);
await lenInput.fill('200');
await page.waitForTimeout(200);
st = await state();
const sb1 = st.beams.find((b) => b.id === 'sb1');
const len = Math.hypot(sb1.x2 - sb1.x1, sb1.y2 - sb1.y1);
check('beam length can be typed', Math.abs(len - 200) < 1.5, `${len.toFixed(1)} mm`);

const angInput = page.locator('.numfield', { hasText: 'Angle' }).locator('input').first();
await angInput.fill('90');
await page.waitForTimeout(200);
st = await state();
const sb1b = st.beams.find((b) => b.id === 'sb1');
const ang = (Math.atan2(sb1b.y2 - sb1b.y1, sb1b.x2 - sb1b.x1) * 180) / Math.PI;
check('beam angle can be typed', Math.abs(ang - 90) < 1, `${ang.toFixed(1)} deg`);

/* ---- dragging only snaps to the hole grid (no neighbour alignment) ---- */
await page.evaluate(() => window.__editor.getState().select([]));
await page.waitForTimeout(100);
const geom = await page.evaluate(() => {
  const s = window.__editor.getState();
  const a = s.project.items.find((i) => i.id === 's1');
  return { ax: a.x, ay: a.y, view: s.view };
});
const stageBox = await page.locator('[data-stage]').boundingBox();
const toScreen = (x, y) => ({
  x: stageBox.x + geom.view.panX + x * geom.view.zoom,
  y: stageBox.y + geom.view.panY + y * geom.view.zoom,
});
const startPt = toScreen(geom.ax, geom.ay);
const endPt = toScreen(geom.ax + 37, geom.ay + 22); // deliberately off-grid
await page.mouse.move(startPt.x, startPt.y);
await page.mouse.down();
await page.mouse.move(endPt.x, endPt.y, { steps: 10 });
await page.waitForTimeout(120);
const guideCount = await page.evaluate(
  () => document.querySelectorAll('[data-stage] line[stroke="#ff4fd8"]').length,
);
check('no alignment guide lines are drawn', guideCount === 0, `${guideCount} lines`);
await page.screenshot({ path: `${outDir}/drag.png` });
await page.mouse.up();
await page.waitForTimeout(150);
st = await state();
const dragged = st.items.find((i) => i.id === 's1');
check(
  'free drag lands on the 25 mm grid',
  dragged.x % 25 === 0 && dragged.y % 25 === 0,
  `${dragged.x},${dragged.y}`,
);

/* ---- collapsible panels ---- */
await page.locator('.tb-btn[title="Show / hide the part library"]').click();
await page.waitForTimeout(250);
check('library panel collapses', (await page.locator('.palette').count()) === 0);
check('reveal handle appears', (await page.locator('.panel-reveal.left').count()) === 1);
await page.screenshot({ path: `${outDir}/collapsed.png` });
await page.locator('.tb-btn[title="Show / hide the part library"]').click();
await page.waitForTimeout(250);
check('library panel comes back', (await page.locator('.palette').count()) === 1);
await page.locator('.tb-btn[title="Show / hide the inspector"]').click();
await page.waitForTimeout(250);
check('inspector collapses', (await page.locator('.inspector').count()) === 0);
await page.locator('.tb-btn[title="Show / hide the inspector"]').click();
await page.waitForTimeout(200);

/* ---- white export flips the ink ---- */
await page.evaluate(() => window.__editor.getState().setBoard({ theme: 'dark' }));
await page.waitForTimeout(150);
const dl = page.waitForEvent('download', { timeout: 20000 });
await page.locator('.btn-primary').click();
await page.waitForTimeout(150);
await page.locator('.seg-mini button', { hasText: 'white' }).click();
await page.locator('.menu button', { hasText: 'SVG' }).click();
const download = await dl;
const svgText = fs.readFileSync(await download.path(), 'utf8');
fs.writeFileSync(`${outDir}/export-white.svg`, svgText);
check('white export darkens the text ink', !/#cfe0f0/i.test(svgText), 'no light ink left');
check('white export keeps data-* out', !/data-ink|data-label/.test(svgText));
check('white export has a white background', /<rect[^>]*fill="#ffffff"/.test(svgText));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.name).join(' | '));
  process.exitCode = 1;
}
