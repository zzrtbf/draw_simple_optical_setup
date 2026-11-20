import type { Theme } from '../model/types';

/**
 * UI chrome accent: selection frames, handles, active tools, section labels.
 * Keep this in sync with `--accent` in styles.css (SVG presentation attributes
 * cannot read CSS variables reliably, so the canvas gets the literal value).
 */
export const UI_ACCENT = '#3b6cff';

export interface ThemeColors {
  boardBg: string;
  boardBorder: string;
  boardEdge: string;
  gridDot: string;
  gridDotBoard: string;
  origin: string;
  label: string;
  labelHalo: string;
  /** page background outside a plate */
  pageBg: string;
  pageGlow: string;
}

export const THEMES: Record<Theme, ThemeColors> = {
  dark: {
    boardBg: '#0b1016',
    boardBorder: '#22303f',
    boardEdge: '#3a5170',
    gridDot: '#2f4157',
    gridDotBoard: '#33475f',
    origin: UI_ACCENT,
    label: '#8ea4bd',
    labelHalo: 'rgba(0,0,0,0.55)',
    pageBg: '#070a0f',
    pageGlow: '#0d141d',
  },
  light: {
    boardBg: '#f7f9fc',
    boardBorder: '#d3dde8',
    boardEdge: '#9fb4c8',
    gridDot: '#c4d0dc',
    gridDotBoard: '#b7c6d5',
    origin: '#1d4ed8',
    label: '#3d5468',
    labelHalo: 'rgba(255,255,255,0.9)',
    pageBg: '#dfe6ee',
    pageGlow: '#eef3f8',
  },
};
