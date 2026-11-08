/**
 * Wavelength (nm) -> display colour.
 *
 * 380–780 nm follows the usual CIE-ish approximation so the rendered colour is
 * the colour the light actually looks like. Outside the visible band the beam is
 * invisible to the eye; those beams are drawn in a dim, slightly desaturated
 * stand-in (far red for IR, violet for UV) and the UI always shows the number, so
 * a 1064 nm path is never mistaken for a 633 nm one.
 */

const GAMMA = 0.8;

function clampChannel(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Visible-spectrum approximation. Returns 0..1 channels before gamma. */
function spectral(nm: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / (440 - 380);
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = -(nm - 510) / (510 - 490);
  } else if (nm < 580) {
    // without the power law the 532 nm line comes out lime-yellow
    r = Math.pow((nm - 510) / (580 - 510), 1.8);
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = -(nm - 645) / (645 - 580);
  } else {
    r = 1;
  }
  return [r, g, b];
}

/** Perceived brightness taper at both ends of the visible band. */
function intensity(nm: number): number {
  if (nm >= 380 && nm < 420) return 0.35 + 0.65 * ((nm - 380) / 40);
  if (nm > 700 && nm <= 780) return 0.35 + 0.65 * ((780 - nm) / 80);
  return 1;
}

export function wavelengthToColor(nm: number): string {
  const wl = Math.max(200, Math.min(3000, Math.round(nm || 0)));

  // Ultraviolet: invisible, drawn as a dim violet.
  if (wl < 380) {
    const t = Math.min(1, (380 - wl) / 180);
    return rgbToHex(168 - 48 * t, 110 - 40 * t, 255 - 55 * t);
  }

  const [r, g, b] = spectral(wl);
  // Eye sensitivity falls off at both ends of the visible band. A plain
  // multiplicative fade makes 780 nm (a rubidium line) almost black on a dark
  // bench, so keep a luminance floor and hand the far red over to a fixed tone.
  const f = Math.max(intensity(wl), 0.62);
  let cr = 255 * Math.pow(r * f, GAMMA);
  let cg = 255 * Math.pow(g * f, GAMMA);
  let cb = 255 * Math.pow(b * f, GAMMA);

  if (wl > 700) {
    // 700 -> 780 nm: fade into the deep red that stands for "long wavelength"
    const t = Math.min(1, (wl - 700) / 80);
    cr = cr + (214 - cr) * t;
    cg = cg + (58 - cg) * t;
    cb = cb + (74 - cb) * t;
  }
  if (wl > 780) {
    // infrared: not visible at all; keep a red path but dull it further
    const t = Math.min(1, (wl - 780) / 900);
    cr = 214 + (168 - 214) * t;
    cg = 58 + (38 - 58) * t;
    cb = 74 + (54 - 74) * t;
  }

  return rgbToHex(cr, cg, cb);
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clampChannel(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Human label: "633 nm", "1064 nm (IR)", "355 nm (UV)". */
export function wavelengthLabel(nm: number): string {
  const wl = Math.round(nm);
  if (wl > 780) return `${wl} nm (IR)`;
  if (wl < 380) return `${wl} nm (UV)`;
  return `${wl} nm`;
}

/** Typical lab lines, offered as one-click presets in the inspector. */
export const WAVELENGTH_PRESETS = [405, 461, 532, 633, 780, 852, 1064, 1550];

/** Rough band name, used in the inspector hint. */
export function wavelengthBand(nm: number): string {
  if (nm < 380) return 'ultraviolet — not visible, drawn dim violet';
  if (nm > 780) return 'infrared — not visible, drawn dim red';
  if (nm < 450) return 'violet';
  if (nm < 495) return 'blue';
  if (nm < 570) return 'green';
  if (nm < 590) return 'yellow';
  if (nm < 620) return 'orange';
  return 'red';
}
