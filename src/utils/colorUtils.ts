import { CanvasStroke, GeometricShape } from '../types';

export function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const val = Math.max(0, Math.min(100, v)) / 100;

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (hue < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (hue < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (hue < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return { h: 0, s: 100, v: 100 };

  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  return {
    h: Math.round(h),
    s: Math.round(s),
    v: Math.round(v),
  };
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return { h: 210, s: 90, l: 50 };

  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h = Math.round(h * 60);
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return { r: 37, g: 99, b: 235 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Harvests all unique colors used across strokes and shapes in the document.
 * Returns sorted list by most recently used / occurrence count.
 */
export function harvestDocumentColors(
  strokes: CanvasStroke[],
  shapes: GeometricShape[],
  recentColors: string[] = []
): string[] {
  const colorMap = new Map<string, number>();

  // Add recent user choices with high base score
  for (let i = recentColors.length - 1; i >= 0; i--) {
    const hex = recentColors[i].toUpperCase();
    colorMap.set(hex, (colorMap.get(hex) || 0) + 10);
  }

  // Count stroke colors
  for (const s of strokes) {
    if (s.color) {
      const hex = s.color.toUpperCase();
      colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }
  }

  // Count shape colors
  for (const sh of shapes) {
    if (sh.strokeColor) {
      const hex = sh.strokeColor.toUpperCase();
      colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }
    if (sh.fillColor && sh.fillColor !== 'transparent') {
      const upper = sh.fillColor.toUpperCase();
      const normalized = /^#[0-9A-F]{8}$/.test(upper) ? upper.slice(0, 7) : upper;
      colorMap.set(normalized, (colorMap.get(normalized) || 0) + 1);
    }
  }

  // Return distinct colors sorted by frequency/recency
  return Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
}

/**
 * Converts a 6-digit hex color and an opacity percentage (0..100)
 * into '#RRGGBBAA' (or 'transparent' when 0, or '#RRGGBB' when 100).
 */
export function hexWithAlphaPercent(hex: string, opacityPercent: number): string {
  const clamped = Math.max(0, Math.min(100, opacityPercent));
  if (clamped <= 0) return 'transparent';

  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  } else if (clean.length === 8) {
    clean = clean.slice(0, 6);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    clean = '0F172A';
  }

  if (clamped >= 100) return `#${clean.toUpperCase()}`;
  const alphaByte = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `#${clean.toUpperCase()}${alphaByte}`;
}

/**
 * Boosts any chosen hex color into a super-bright, high-contrast highlighter tone
 * so every color in the palette/rainbow produces luminous, vivid highlights.
 */
export function getBrightHighlighterColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  if (s < 8) {
    return hslToHex(205, 45, 84);
  }
  const isCoolDarkHue = (h >= 210 && h <= 300) || h <= 15 || h >= 340;
  const targetL = isCoolDarkHue
    ? Math.max(67, Math.min(75, l))
    : Math.max(58, Math.min(72, l));
  const targetS = Math.max(94, Math.min(100, s));
  return hslToHex(h, targetS, targetL);
}

/**
 * Computes the bounded color-dodge tint for highlighter Pass 1:
 * lifts white, cream, and gray backgrounds toward super-bright white
 * while keeping dark ink & colored elements dark and saturated.
 */
export function getHighlighterDodgeColor(brightHex: string): string {
  const { r, g, b } = hexToRgb(brightHex);
  const toHex = (ch: number) =>
    Math.round(Math.max(0, Math.min(1, 0.18 + 0.18 * (ch / 255))) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Preset quick classroom teaching colors
export const CLASSROOM_PRESET_COLORS = [
  '#0F172A', // Slate Black (Writing)
  '#2563EB', // Cobalt Blue (Notes)
  '#DC2626', // Crimson Red (Corrections/Key steps)
  '#16A34A', // Forest Green (Definitions/Solutions)
  '#9333EA', // Purple (Insights)
  '#F59E0B', // Amber (Attention)
  '#06B6D4', // Cyan (Geometry)
  '#E11D48', // Rose Pink
];
