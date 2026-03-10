/**
 * Figma → Code value converters.
 * Pure functions — transform normalized Figma data into code token formats.
 */

import type { FigmaTextStyleInfo, FigmaColorInfo, FigmaEffectDetail } from '@shared/styleTypes';
import type { TextStyleToken, EffectToken } from '@shared/protocol';

// ── Font weight lookup ────────────────────────────────────

const FONT_WEIGHT_MAP: Record<string, number> = {
  thin: 100,
  hairline: 100,
  'extra light': 200,
  'ultra light': 200,
  light: 300,
  regular: 400,
  normal: 400,
  medium: 500,
  'semi bold': 600,
  'demi bold': 600,
  bold: 700,
  'extra bold': 800,
  'ultra bold': 800,
  black: 900,
  heavy: 900,
};

function fontWeightFromStyle(style: string): number {
  const normalized = style.toLowerCase().replace(/[-_]/g, ' ').trim();
  // Try full match first
  if (FONT_WEIGHT_MAP[normalized] !== undefined) return FONT_WEIGHT_MAP[normalized];
  // Try partial match (e.g. "Semi Bold Italic" → "semi bold")
  for (const [key, weight] of Object.entries(FONT_WEIGHT_MAP)) {
    if (normalized.includes(key)) return weight;
  }
  return 400; // fallback
}

// ── Text styles ───────────────────────────────────────────

export function textStyleToCode(info: FigmaTextStyleInfo): TextStyleToken {
  const token: TextStyleToken = {
    fontSize: Math.round(info.fontSize),
    lineHeight: info.lineHeight.unit === 'PERCENT'
      ? `${Math.round(info.lineHeight.value)}%`
      : info.lineHeight.unit === 'PIXELS'
        ? Math.round(info.lineHeight.value)
        : 'auto',
    fontWeight: fontWeightFromStyle(info.fontStyle || 'Regular'),
  };

  if (info.letterSpacing.value !== 0) {
    token.letterSpacing = info.letterSpacing.unit === 'PERCENT'
      ? `${info.letterSpacing.value.toFixed(1)}%`
      : `${info.letterSpacing.value.toFixed(1)}px`;
  }

  if (info.textCase && info.textCase !== 'ORIGINAL') {
    token.textCase = info.textCase;
  }

  if (info.fontFamily) {
    token.fontFamily = info.fontFamily;
  }

  return token;
}

// ── Colors ────────────────────────────────────────────────

export function colorToCode(r: number, g: number, b: number, a: number): string {
  const hex = '#' + [r, g, b]
    .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
    .join('');

  if (a < 0.999) {
    const alphaHex = Math.round(a * 255).toString(16).padStart(2, '0');
    return hex + alphaHex;
  }
  return hex;
}

export function colorInfoToCode(info: FigmaColorInfo): string {
  return colorToCode(info.r, info.g, info.b, info.a);
}

// ── Effects ───────────────────────────────────────────────

export function effectToCode(detail: FigmaEffectDetail): EffectToken {
  return {
    type: detail.type.toLowerCase().replace(/_/g, '-'),
    color: colorToCode(detail.color.r, detail.color.g, detail.color.b, 1),
    opacity: detail.color.a,
    x: detail.offset.x,
    y: detail.offset.y,
    blur: detail.radius,
    spread: detail.spread,
  };
}

// ── Numeric ───────────────────────────────────────────────

export function numericToCode(value: number): number {
  return Math.round(value * 100) / 100;
}
