import { useMemo } from 'react';
import type { Project } from '../model/types';
import { traceScene, type BeamSample } from '../lib/optics';

/** Floor so a tightly focused beam never disappears into a hairline. */
const MIN_HW = 0.1;

/**
 * Builds the outline of a beam as one closed polygon: walk the centre line with
 * the Gaussian half width on the left, then come back on the right. A collimated
 * beam becomes a rectangle, a focused one narrows to a cusp at the waist.
 */
function ribbon(samples: BeamSample[]): string {
  if (samples.length < 2) return '';
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const hw = Math.max(p.hw, MIN_HW);
    left.push(`${round(p.x + nx * hw)},${round(p.y + ny * hw)}`);
    right.push(`${round(p.x - nx * hw)},${round(p.y - ny * hw)}`);
  }
  return [...left, ...right.reverse()].join(' ');
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Automatically traced beams. Purely derived from the scene: nothing here is
 * stored in the project, so moving a mirror re-routes the light immediately.
 */
export function AutoBeams({ project }: { project: Project }) {
  const beams = useMemo(() => traceScene(project), [project]);
  if (!project.board.showAutoBeams || beams.length === 0) return null;

  return (
    <g data-auto-beams="1" style={{ pointerEvents: 'none' }}>
      {beams.map((b) => {
        const polygon = ribbon(b.samples);
        if (!polygon) return null;
        const last = b.samples[b.samples.length - 1];
        return (
          <g key={b.id} data-auto-beam={b.id} data-wavelength={b.wavelength}>
            {/* soft halo so the beam reads on a dark bench */}
            <polygon points={polygon} fill={b.color} fillOpacity={b.opacity * 0.16} stroke="none" />
            <polygon
              points={polygon}
              fill={b.color}
              fillOpacity={b.opacity * 0.55}
              stroke={b.color}
              strokeOpacity={b.opacity * 0.9}
              strokeWidth={0.12}
              strokeLinejoin="round"
            />
            {b.ended === 'detector' && <circle cx={last.x} cy={last.y} r={0.7} fill={b.color} fillOpacity={0.9} />}
          </g>
        );
      })}
    </g>
  );
}
