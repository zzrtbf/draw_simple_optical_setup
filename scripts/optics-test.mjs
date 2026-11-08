/**
 * Optics engine regression: reflection, thin-lens focusing, splitters,
 * detectors, blockers and the wavelength -> colour mapping.
 *
 *   npm run dev          # in another terminal
 *   npm run test:optics
 *
 * Runs against the dev server because it imports the TypeScript source directly.
 */
import { chromium, webkit } from 'playwright-core';
import { findBrowser } from './browser-path.mjs';

const ENGINE = (process.env.PW_ENGINE || 'chromium').toLowerCase();
const EDGE = ENGINE === 'webkit' ? '' : findBrowser();
const URL = process.env.APP_URL || 'http://127.0.0.1:5180/';

if (ENGINE !== 'webkit' && !EDGE) {
  console.error('No Chromium-based browser found — set EDGE_PATH or CHROME_PATH.');
  process.exit(1);
}

const browser =
  ENGINE === 'webkit'
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(URL, { waitUntil: 'load' });

const lines = await page.evaluate(async () => {
  const optics = await import('/src/lib/optics.ts');
  const spectrum = await import('/src/lib/spectrum.ts');
  const { traceScene, raySegment, reflect } = optics;
  const { wavelengthToColor } = spectrum;

  const out = [];
  const check = (name, ok, extra = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);

  const item = (id, lib, x, y, rot = 0, extra = {}) => ({
    id, kind: 'lib', lib, x, y, rot,
    w: extra.w ?? 10, h: extra.h ?? 29,
    label: id, showLabel: false, labelOffset: null, locked: false, collide: true, snap: true, z: 25.4,
    ...extra,
  });
  const proj = (items) => ({
    schema: 'optical-setup/1', name: 't',
    board: { mode: 'plate', w: 600, h: 450, showGrid: true, pitch: 25, theme: 'dark', showAutoBeams: true },
    items, beams: [],
  });
  const laser = (x, y, extra = {}) => item('L', 'c-laser1', x, y, 0, { w: 62, h: 46, emit: true, wavelength: 633, beamDia: 2, ...extra });

  /* --- primitives --- */
  check('reflect (1,0) about a 45 deg normal gives (0,-1)', (() => {
    const d = reflect({ x: 1, y: 0 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 });
    return Math.abs(d.x) < 1e-9 && Math.abs(d.y + 1) < 1e-9;
  })());
  check('ray/segment hit distance', Math.abs(raySegment({ x: 0, y: 5 }, { x: 1, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }) - 10) < 1e-9);
  check('ray/segment miss outside the aperture',
    !Number.isFinite(raySegment({ x: 0, y: 50 }, { x: 1, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })));

  /* --- free space --- */
  {
    const b = traceScene(proj([laser(100, 100)]));
    const hws = b[0].samples.map((s) => s.hw);
    check('free space: one beam reaching the board edge', b.length === 1 && b[0].ended === 'edge', `${b.length}, ${b[0]?.ended}`);
    // 633 nm over 500 mm diffracts by ~0.5 %
    check('collimated: diameter stays within 1 % of 2 mm',
      Math.abs(Math.max(...hws) - 1) < 0.01 && Math.abs(Math.min(...hws) - 1) < 0.01,
      `hw ${Math.min(...hws).toFixed(4)}..${Math.max(...hws).toFixed(4)} mm`);
    check('633 nm renders red', /^#ff/.test(wavelengthToColor(633)), wavelengthToColor(633));
  }

  /* --- mirror --- */
  {
    const b = traceScene(proj([laser(100, 100), item('M', 'b-mir', 300, 100, 45, { w: 10.7, h: 29.1 })]));
    const last = b[0].samples[b[0].samples.length - 1];
    check('mirror: hit recorded', b[0].hits.length === 1 && b[0].hits[0].itemId === 'M');
    check('mirror: beam leaves 90 deg from the incoming direction',
      Math.abs(last.x - 300) < 3 && last.y < 20, `ends at ${last.x.toFixed(1)},${last.y.toFixed(1)}`);
  }

  /* --- lenses --- */
  {
    const base = [laser(100, 100, { wavelength: 1064, beamDia: 2 })];
    const conv = traceScene(proj([...base, item('F', 'b-lens2', 300, 100, 0, { w: 9.3, h: 23.4, focal: 100 })]));
    const div = traceScene(proj([...base, item('F', 'b-lens3', 300, 100, 0, { w: 9.3, h: 23.4, focal: -100 })]));
    const waist = conv[0].samples.reduce((a, b) => (b.hw < a.hw ? b : a));
    const after = div[0].samples.filter((s) => s.x > 380).map((s) => s.hw);
    check('convex lens focuses the beam', waist.hw < 0.15, `waist hw ${waist.hw.toFixed(4)} mm`);
    check('focus lands near z = f', Math.abs(waist.x - 400) < 15, `waist at x=${waist.x.toFixed(1)}`);
    check('concave lens expands the beam', Math.max(...after) > 1.5, `hw after ${Math.max(...after).toFixed(2)} mm`);
  }

  /* --- beamsplitter --- */
  {
    const b = traceScene(proj([laser(100, 100, { wavelength: 532 }), item('S', 'b-bsp', 300, 100, 0, { w: 23.4, h: 23.4 })]));
    check('splitter: two arms', b.length === 2, `${b.length}`);
    check('splitter: both arms share the colour', b.length === 2 && b[0].color === b[1].color, b[0]?.color);
    check('splitter: both arms start at the input diameter',
      b.length === 2 && Math.abs(b[0].samples[0].hw - b[1].samples[0].hw) < 1e-3,
      b.length === 2 ? `${b[0].samples[0].hw.toFixed(4)} vs ${b[1].samples[0].hw.toFixed(4)}` : 'n/a');
  }

  /* --- divergence survives the split --- */
  {
    const b = traceScene(proj([
      laser(100, 100, { wavelength: 1064 }),
      item('F', 'b-lens3', 200, 100, 0, { w: 9.3, h: 23.4, focal: -60 }),
      item('S', 'b-bsp', 320, 100, 0, { w: 23.4, h: 23.4 }),
    ]));
    const split = { x: 320, y: 100 };
    const localSlope = (bm) => {
      const arr = bm.samples.map((p) => ({ ...p, d: Math.hypot(p.x - split.x, p.y - split.y) }));
      let i0 = 0;
      let best = Infinity;
      arr.forEach((p, i) => { if (p.d < best) { best = p.d; i0 = i; } });
      const s = arr.slice(i0);
      const a = s.find((p) => p.d > 20);
      const z = s.find((p) => p.d > 80);
      if (!a || !z) return NaN;
      return (z.hw - a.hw) / (z.d - a.d);
    };
    check('both split arms keep the same divergence',
      b.length === 2 && Math.abs(localSlope(b[0]) - localSlope(b[1])) < 0.004,
      b.length === 2 ? `${localSlope(b[0]).toFixed(5)} vs ${localSlope(b[1]).toFixed(5)} per mm` : 'n/a');
  }

  /* --- detectors / blockers / transparency --- */
  {
    const d = traceScene(proj([laser(100, 100), item('D', 'e-pd1', 300, 100, 0, { w: 16, h: 23 })]));
    const lastD = d[0].samples[d[0].samples.length - 1];
    check('detector: stops the beam', d[0].ended === 'detector', d[0].ended);
    check('detector: nothing continues past it', lastD.x <= 301, `last x ${lastD.x.toFixed(2)}`);

    const blk = traceScene(proj([laser(100, 100), item('B', 'b-dump', 250, 100, 0, { w: 22, h: 33 })]));
    check('beam dump stops the beam', blk[0].ended === 'blocker', blk[0].ended);

    const free = traceScene(proj([laser(100, 100), item('E', 'e-amp', 250, 100, 0, { w: 60, h: 30 })]));
    check('non-optical parts are transparent', free[0].ended === 'edge', free[0].ended);
  }

  /* --- switches --- */
  {
    check('emit = false produces no beam',
      traceScene(proj([item('L', 'c-laser1', 100, 100, 0, { w: 62, h: 46, emit: false })])).length === 0);
    check('coupler in "receive" mode does not emit',
      traceScene(proj([item('C', 'b-coupler', 100, 100, 0, { w: 18, h: 23, couplerMode: 'in' })])).length === 0);
    check('coupler in "collimate" mode emits',
      traceScene(proj([item('C', 'b-coupler', 100, 100, 0, { w: 18, h: 23, couplerMode: 'out' })])).length === 1);
  }

  /* --- wavelength mapping --- */
  {
    const hex = (nm) => wavelengthToColor(nm);
    const ch = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r405, g405, b405] = ch(hex(405));
    const [r532, g532, b532] = ch(hex(532));
    const [r633, g633] = ch(hex(633));
    check('405 nm is violet-blue', b405 > r405 && b405 > g405, hex(405));
    check('532 nm is green', g532 > r532 && g532 > b532, hex(532));
    check('633 nm is red', r633 > g633 + 60, hex(633));
    check('1064 nm stays a readable deep red', (() => {
      const [r, g, b] = ch(hex(1064));
      return r > 120 && g < 90 && b < 110;
    })(), hex(1064));
    check('1550 nm is duller than 1064 nm', (() => {
      const [r1] = ch(hex(1064));
      const [r2] = ch(hex(1550));
      return r2 < r1;
    })());
  }

  return out;
});

console.log(lines.join('\n'));
await browser.close();

const failed = lines.filter((l) => l.startsWith('FAIL'));
console.log(`\n${lines.length - failed.length}/${lines.length} optics checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
