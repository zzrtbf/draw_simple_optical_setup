/**
 * Interaction regression tests. Needs the dev server running (`npm run dev`).
 *
 *   node scripts/ui-test.mjs
 *
 * Uses any installed Chromium (Edge / Chrome / Brave); override with EDGE_PATH.
 * On macOS the shortcut assertions press Cmd (Meta) instead of Ctrl.
 * Set PW_ENGINE=webkit to run the same checks on Playwright's WebKit build —
 * the same engine Safari uses — which is how the Mac/Safari port is verified.
 */
import { chromium, webkit } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { findBrowser } from './browser-path.mjs';

const ENGINE = (process.env.PW_ENGINE || 'chromium').toLowerCase();
const EDGE = ENGINE === 'webkit' ? '' : findBrowser();
const URL = process.env.APP_URL || 'http://127.0.0.1:5180/';
const outDir = process.env.SHOT_DIR || '.tmp/ui';
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

const readState = () =>
  page.evaluate(() => {
    const s = window.__editor.getState();
    return {
      items: s.project.items.map((i) => ({
        id: i.id,
        kind: i.kind,
        x: i.x,
        y: i.y,
        w: i.w,
        h: i.h,
        rot: i.rot,
        text: i.text,
      })),
      beams: s.project.beams.map((b) => ({ id: b.id, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 })),
      selection: s.selection,
      board: s.project.board,
      past: s.past.length,
      tool: s.tool,
    };
  });

/* ------------------------------------------------------------------ */
await page.goto(URL + '?demo', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

let st = await readState();
check('demo loads 9 parts', st.items.length === 9, `items=${st.items.length}`);
check('demo loads 5 beams', st.beams.length === 5);
await page.screenshot({ path: `${outDir}/01-demo.png` });

/* drag a part into empty bench space so no neighbour guide takes over */
const m1 = page.locator('[data-id="s2"]').first();
const box = await m1.boundingBox();
const scen = await page.evaluate(() => window.__editor.getState());
const stageBox = await page.locator('[data-stage]').boundingBox();
const toPx = (x, y) => ({
  x: stageBox.x + scen.view.panX + x * scen.view.zoom,
  y: stageBox.y + scen.view.panY + y * scen.view.zoom,
});
const dragFrom = toPx(260, 120);
const dragTo = toPx(300, 400);
await page.mouse.move(dragFrom.x, dragFrom.y);
await page.mouse.down();
await page.mouse.move(dragTo.x, dragTo.y, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(120);
st = await readState();
let item = st.items.find((i) => i.id === 's2');
check('drag moves the part', item.x !== 260 || item.y !== 120, `${item.x},${item.y}`);
check('drag snaps to the 25 mm grid', item.x % 25 === 0 && item.y % 25 === 0, `${item.x},${item.y}`);

await page.keyboard.press(`${MOD}+z`);
await page.waitForTimeout(120);
st = await readState();
item = st.items.find((i) => i.id === 's2');
check('undo restores the position', item.x === 260 && item.y === 120, `${item.x},${item.y}`);

/* select + resize */
await page.locator('[data-id="s8"]').first().click();
await page.waitForTimeout(100);
st = await readState();
check('click selects', st.selection[0] === 's8');

const hb = await page.locator('[data-handle="se"]').first().boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(hb.x + hb.width / 2 + 50, hb.y + hb.height / 2 + 30, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(120);
st = await readState();
item = st.items.find((i) => i.id === 's8');
check('corner handle resizes', Math.abs(item.w - 120) > 5 && Math.abs(item.h - 50) > 5, `${item.w}×${item.h}`);
await page.screenshot({ path: `${outDir}/02-resize.png` });

/* rotate */
const rh = await page.locator('[data-handle="rot"]').first().boundingBox();
await page.mouse.move(rh.x + 4, rh.y + 4);
await page.mouse.down();
await page.mouse.move(rh.x + 120, rh.y + 90, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(120);
st = await readState();
check('rotate handle works', Math.abs(st.items.find((i) => i.id === 's8').rot) > 1);

/* draw a beam */
await page.keyboard.press('Escape');
await page.keyboard.press('b');
const beamsBefore = (await readState()).beams.length;
await page.mouse.move(700, 800);
await page.mouse.down();
await page.mouse.move(1050, 800, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(150);
st = await readState();
check('beam tool creates a beam', st.beams.length === beamsBefore + 1);
const nb = st.beams[st.beams.length - 1];
check('beam endpoints snap to holes', nb.x1 % 25 === 0 && nb.y1 % 25 === 0 && nb.x2 % 25 === 0);
await page.screenshot({ path: `${outDir}/03-beam.png` });

/* beam endpoint drag (handles must sit above the parts) */
await page.evaluate(() => window.__editor.getState().select(['sb1']));
await page.waitForTimeout(100);
const ph = await page.locator('[data-handle="p2"]').first().boundingBox();
const b1 = (await readState()).beams.find((b) => b.id === 'sb1');
await page.mouse.move(ph.x + ph.width / 2, ph.y + ph.height / 2);
await page.mouse.down();
await page.mouse.move(ph.x + 80, ph.y + 60, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(120);
const b2 = (await readState()).beams.find((b) => b.id === 'sb1');
check('beam endpoint handle drags', b1.x2 !== b2.x2 || b1.y2 !== b2.y2, `${b1.x2},${b1.y2} -> ${b2.x2},${b2.y2}`);

/* text tool + inline edit */
await page.keyboard.press('Escape');
await page.keyboard.press('t');
await page.waitForTimeout(150);
st = await readState();
const textItem = st.items[st.items.length - 1];
check('T inserts a text item', textItem.kind === 'text');
await page.locator(`[data-id="${textItem.id}"]`).first().dblclick();
await page.waitForTimeout(200);
check('double click opens the inline editor', (await page.locator('.text-editor').count()) === 1);
await page.locator('.text-editor').fill('MOT beam');
await page.keyboard.press(`${MOD}+Enter`);
await page.waitForTimeout(150);
st = await readState();
check('inline edit commits', st.items.find((i) => i.id === textItem.id).text === 'MOT beam');

/* marquee */
await page.keyboard.press('Escape');
await page.mouse.move(300, 120);
await page.mouse.down();
await page.mouse.move(1000, 620, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(150);
st = await readState();
check('marquee selects several objects', st.selection.length >= 3, `${st.selection.length}`);

/* align: multi-select buttons should line the rotated bounding boxes up */
const leftEdges = () =>
  page.evaluate(() => {
    const s = window.__editor.getState();
    const sel = new Set(s.selection);
    return s.project.items
      .filter((i) => sel.has(i.id) && i.kind !== 'text')
      .map((i) => {
        const rad = (i.rot * Math.PI) / 180;
        const hx = Math.abs((i.w / 2) * Math.cos(rad)) + Math.abs((i.h / 2) * Math.sin(rad));
        return Math.round((i.x - hx) * 100) / 100;
      });
  });
const alignBtn = page.locator('.btn-row button', { hasText: 'Left' }).first();
if (await alignBtn.count()) {
  const before = await leftEdges();
  await alignBtn.click();
  await page.waitForTimeout(150);
  const after = await leftEdges();
  const spread = Math.max(...after) - Math.min(...after);
  check('align left lines the edges up', after.length > 1 && spread < 0.2, `${before.join('/')} -> ${after.join('/')}`);
}

/* palette */
await page.keyboard.press('Escape');
const itemsBefore = (await readState()).items.length;
await page.locator('.pal-item').first().click();
await page.waitForTimeout(150);
st = await readState();
check('palette click adds a part', st.items.length === itemsBefore + 1);
await page.keyboard.press('Delete');
await page.waitForTimeout(120);
check('delete removes it', (await readState()).items.length === itemsBefore);

/* board modes */
await page.keyboard.press('Escape');
await page.locator('.segmented button', { hasText: 'Infinite' }).first().click();
await page.waitForTimeout(150);
check('switch to infinite bench', (await readState()).board.mode === 'infinite');
await page.screenshot({ path: `${outDir}/04-infinite.png` });
await page.locator('.segmented button', { hasText: 'Breadboard' }).first().click();

/* exports */
const grab = async (clicks) => {
  const dl = page.waitForEvent('download', { timeout: 20000 });
  await clicks();
  const d = await dl;
  return { file: await d.path(), name: d.suggestedFilename() };
};

let dl = await grab(async () => {
  await page.locator('.btn-primary').click();
  await page.waitForTimeout(150);
  await page.locator('.menu button', { hasText: '4×' }).click();
});
check('PNG export downloads', !!dl.file, `${dl.name} ${(fs.statSync(dl.file).size / 1024).toFixed(0)} kB`);
fs.copyFileSync(dl.file, `${outDir}/export.png`);

dl = await grab(async () => {
  await page.locator('.btn-primary').click();
  await page.waitForTimeout(150);
  await page.locator('.menu button', { hasText: 'SVG' }).click();
});
const svgText = fs.readFileSync(dl.file, 'utf8');
check('SVG export is vector + mm', /viewBox="/.test(svgText) && /width="[\d.]+mm"/.test(svgText));
check('SVG export has no editor chrome', !/data-ui/.test(svgText));
fs.writeFileSync(`${outDir}/export.svg`, svgText);

dl = await grab(async () => {
  await page.locator('.btn-primary').click();
  await page.waitForTimeout(150);
  await page.locator('.menu button', { hasText: '3D scene JSON' }).click();
});
const scene = JSON.parse(fs.readFileSync(dl.file, 'utf8'));
check('3D scene JSON exports', scene.schema === 'optical-bench/scene3d/1' && scene.items.length > 0);

/* save via the download fallback */
await page.evaluate(() => {
  try {
    delete window.showSaveFilePicker;
  } catch {
    /* ignore */
  }
});
dl = await grab(() => page.keyboard.press(`${MOD}+s`));
const saved = JSON.parse(fs.readFileSync(dl.file, 'utf8'));
check('project save round-trips', saved.schema === 'optical-setup/1' && Array.isArray(saved.items));

/* deep undo */
for (let i = 0; i < 25; i++) await page.keyboard.press(`${MOD}+z`);
await page.waitForTimeout(200);
check('deep undo survives', Array.isArray((await readState()).items));

/* white background export preview (?export dev hook) */
await page.goto(URL + '?demo&export&bg=white&scale=3', { waitUntil: 'load' });
await page.waitForTimeout(2200);
check('export preview renders', (await page.locator('.preview-overlay img').count()) === 1);
await page.screenshot({ path: `${outDir}/05-export-white.png` });

fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.name).join(' | '));
  process.exitCode = 1;
}
