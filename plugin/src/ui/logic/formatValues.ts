/**
 * Value formatting for Style Inspector display.
 * Pure functions — no React, no side effects.
 */

import type {
  FigmaTextStyleInfo,
  FigmaColorInfo,
  FigmaEffectDetail,
} from '@shared/styleTypes';
import type { TextStyleToken, EffectToken } from '@shared/protocol';

// ── Text styles ────────────────────────────────────────────────

export function formatTextStyle(info: FigmaTextStyleInfo): string {
  const parts: string[] = [];

  parts.push(`${Math.round(info.fontSize)}px`);

  if (info.fontStyle && info.fontStyle !== 'Regular') {
    parts.push(info.fontStyle);
  }

  // Line height
  if (info.lineHeight.unit === 'AUTO') {
    parts.push('LH auto');
  } else if (info.lineHeight.unit === 'PERCENT') {
    parts.push(`LH ${Math.round(info.lineHeight.value)}%`);
  } else {
    parts.push(`LH ${Math.round(info.lineHeight.value)}px`);
  }

  // Letter spacing (only if non-zero)
  if (info.letterSpacing.value !== 0) {
    if (info.letterSpacing.unit === 'PERCENT') {
      parts.push(`LS ${info.letterSpacing.value.toFixed(1)}%`);
    } else {
      parts.push(`LS ${info.letterSpacing.value.toFixed(1)}px`);
    }
  }

  // Text case (only if not ORIGINAL)
  if (info.textCase && info.textCase !== 'ORIGINAL') {
    parts.push(info.textCase);
  }

  return parts.join(' \u00B7 ');
}

export function formatTextStyleFromCode(token: TextStyleToken): string {
  const parts: string[] = [];

  parts.push(`${Math.round(token.fontSize)}px`);

  // Line height
  if (typeof token.lineHeight === 'string') {
    parts.push(`LH ${token.lineHeight}`);
  } else if (token.lineHeight > 0) {
    parts.push(`LH ${Math.round(token.lineHeight)}px`);
  }

  if (token.letterSpacing) {
    parts.push(`LS ${token.letterSpacing}`);
  }

  if (token.textCase && token.textCase !== 'ORIGINAL') {
    parts.push(token.textCase);
  }

  return parts.join(' \u00B7 ');
}

// ── Colors ─────────────────────────────────────────────────────

export function formatColor(r: number, g: number, b: number, a: number): string {
  const hex = '#' + [r, g, b]
    .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
    .join('');

  if (a < 0.999) {
    return `${hex} @ ${Math.round(a * 100)}%`;
  }
  return hex;
}

export function formatColorFromCode(value: string): string {
  // Code colors are already in hex or rgba format
  return value;
}

// ── Effects ────────────────────────────────────────────────────

export function formatEffect(detail: FigmaEffectDetail): string {
  const typeName = detail.type.toLowerCase().replace(/_/g, '-');
  const hex = '#' + [detail.color.r, detail.color.g, detail.color.b]
    .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
    .join('');
  const opacity = Math.round(detail.color.a * 100);

  return `${typeName} ${detail.offset.x} ${detail.offset.y}px ${detail.radius}px ${hex} ${opacity}%`;
}

export function formatEffectFromCode(token: EffectToken): string {
  return `${token.x} ${token.y}px ${token.blur}px ${token.color} ${Math.round(token.opacity * 100)}%`;
}

// ── Numeric ────────────────────────────────────────────────────

export function formatNumeric(value: number): string {
  return `${value}px`;
}

// ── Comparison helpers ─────────────────────────────────────────

export function textStylesEqual(figma: FigmaTextStyleInfo, code: TextStyleToken): boolean {
  if (Math.round(figma.fontSize) !== Math.round(code.fontSize)) return false;

  // Compare line height
  if (figma.lineHeight.unit === 'PERCENT') {
    if (typeof code.lineHeight === 'string') {
      const codePercent = parseFloat(code.lineHeight);
      if (Math.abs(figma.lineHeight.value - codePercent) > 0.5) return false;
    } else {
      return false;
    }
  } else if (figma.lineHeight.unit === 'PIXELS') {
    if (typeof code.lineHeight === 'number') {
      if (Math.abs(figma.lineHeight.value - code.lineHeight) > 0.5) return false;
    } else {
      return false;
    }
  }

  return true;
}

export function colorsEqual(figma: FigmaColorInfo, codeHex: string): boolean {
  const figmaHex = '#' + [figma.r, figma.g, figma.b]
    .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
    .join('');
  return figmaHex.toLowerCase() === codeHex.toLowerCase().slice(0, 7);
}

export function effectsEqual(figma: FigmaEffectDetail, code: EffectToken): boolean {
  return (
    Math.abs(figma.offset.x - code.x) < 0.5 &&
    Math.abs(figma.offset.y - code.y) < 0.5 &&
    Math.abs(figma.radius - code.blur) < 0.5 &&
    Math.abs(figma.spread - code.spread) < 0.5
  );
}

export function numericEqual(figmaValue: number, codeValue: number): boolean {
  return Math.abs(figmaValue - codeValue) < 0.01;
}
