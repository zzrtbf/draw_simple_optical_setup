/**
 * "Convert to hand-drawn": copy a traced path into ordinary Beam segments.
 *
 * The auto path is a sampled polyline carrying a Gaussian half-width at every
 * sample, while the manual Beam model is a straight two-ended taper. To keep
 * the result close we cut the path at every optical hit and at every local
 * waist, so each piece is straight and monotonic in width. The conversion is
 * deliberately lossy (hyperbolic envelope -> linear taper) but every vertex,
 * and the focus itself, is preserved exactly. After baking the beams no longer
 * follow the layout — that is the point: they are now the user's drawing.
 */
import { newId, type Beam, type LibItem } from '../model/types';
import type { TracedBeam } from './optics';

/** shorter pieces are the EPS gap the tracer leaves at a surface, not content */
const MIN_SEGMENT = 0.1; // mm
/** keep a true zero-width focus something the renderer can still draw */
const MIN_WIDTH = 0.02; // mm
/** same visibility floor the auto layer uses for a weak split arm */
const MIN_SHARE = 0.06;

export function bakeTracedBeams(traced: TracedBeam[], source: LibItem): Beam[] {
  const peak = Math.max(...traced.map((b) => b.power), 1e-9);
  const out: Beam[] = [];

  for (const path of traced) {
    const samples = path.samples;
    const n = samples.length;
    if (n < 2) continue;

    const cuts = new Set<number>([0, n - 1]);

    // split at every waist so a focused beam keeps its cusp
    for (let i = 1; i < n - 1; i++) {
      if (samples[i].hw <= samples[i - 1].hw && samples[i].hw <= samples[i + 1].hw) cuts.add(i);
    }
    // ...and at every surface hit (mirror corner, lens plane, detector face)
    for (const hit of path.hits) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const d = (samples[i].x - hit.x) ** 2 + (samples[i].y - hit.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      cuts.add(best);
    }

    const order = [...cuts].sort((a, b) => a - b);
    const share = Math.max(path.power / peak, MIN_SHARE);
    const opacity = Math.min(1, path.opacity * share);

    for (let k = 0; k + 1 < order.length; k++) {
      const a = samples[order[k]];
      const b = samples[order[k + 1]];
      if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_SEGMENT) continue;
      out.push({
        id: newId('b'),
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        w1: Math.max(MIN_WIDTH, a.hw * 2),
        w2: Math.max(MIN_WIDTH, b.hw * 2),
        wavelength: path.wavelength,
        color: path.color,
        opacity,
        label: '',
        showLabel: false,
        locked: false,
        snap: false,
        z: source.z,
        bakedFrom: source.id,
      });
    }
  }
  return out;
}
