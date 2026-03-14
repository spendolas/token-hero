/**
 * Normalize a raw token snapshot from the bridge into the shape
 * that diffEngine expects (TokenSnapshotResultPayload).
 *
 * json-source files like sombra.ds.json store tokens as objects
 * keyed by Variable ID:
 *   { "VariableID:106:3": { figmaName, value, cssVar, tailwind, ... } }
 *
 * The diff engine expects flat records keyed by name:
 *   colors:     Record<string, string>  (name → hex)
 *   spacing:    Record<string, number>  (name → px value)
 *   radius:     Record<string, number>
 *   sizes:      Record<string, number>
 *   textStyles: Record<string, TextStyleToken>
 */

import type { TokenSnapshotResultPayload, TextStyleToken } from '@shared/protocol';

interface RawTokenObj {
  figmaName?: string;
  value?: unknown;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

function isTokenObj(v: unknown): v is RawTokenObj {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && 'figmaName' in (v as Record<string, unknown>);
}

function normalizeColorGroup(
  raw: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!raw) return undefined;
  const result: Record<string, string> = {};
  for (const key of Object.keys(raw)) {
    const entry = raw[key];
    if (isTokenObj(entry) && typeof entry.value === 'string') {
      result[entry.figmaName!] = entry.value;
    } else if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeNumericGroup(
  raw: Record<string, unknown> | undefined,
): Record<string, number> | undefined {
  if (!raw) return undefined;
  const result: Record<string, number> = {};
  for (const key of Object.keys(raw)) {
    const entry = raw[key];
    if (isTokenObj(entry) && typeof entry.value === 'number') {
      result[entry.figmaName!] = entry.value;
    } else if (typeof entry === 'number') {
      result[key] = entry;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeTextStyles(
  raw: Record<string, unknown> | undefined,
): Record<string, TextStyleToken> | undefined {
  if (!raw) return undefined;
  const result: Record<string, TextStyleToken> = {};
  for (const key of Object.keys(raw)) {
    const entry = raw[key] as RawTokenObj | TextStyleToken;
    if (isTokenObj(entry) && entry.properties) {
      const p = entry.properties;
      result[entry.figmaName!] = {
        fontSize: typeof p.fontSize === 'string' ? parseFloat(p.fontSize) : (p.fontSize as number) || 0,
        lineHeight: (p.lineHeight as string | number) || 0,
        fontWeight: (p.fontWeight as number) || 400,
        letterSpacing: p.letterSpacing as string | undefined,
        textCase: p.textCase as string | undefined,
        fontFamily: p.fontFamily as string | undefined,
      };
    } else if ('fontSize' in entry) {
      // Already in the expected format
      result[key] = entry as TextStyleToken;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function normalizeSnapshot(
  raw: TokenSnapshotResultPayload,
): TokenSnapshotResultPayload {
  const tokens = raw.tokens;
  if (!tokens) return raw;

  // Check if normalization is needed by sampling the first color entry
  const colorKeys = tokens.colors ? Object.keys(tokens.colors) : [];
  const firstColor = colorKeys.length > 0 ? (tokens.colors as Record<string, unknown>)[colorKeys[0]] : null;
  const needsNormalization = firstColor !== null && typeof firstColor === 'object';

  if (!needsNormalization) return raw;

  return {
    sourceFile: raw.sourceFile,
    readAt: raw.readAt,
    tokens: {
      colors: normalizeColorGroup(tokens.colors as unknown as Record<string, unknown>),
      spacing: normalizeNumericGroup(tokens.spacing as unknown as Record<string, unknown>),
      radius: normalizeNumericGroup(tokens.radius as unknown as Record<string, unknown>),
      sizes: normalizeNumericGroup(tokens.sizes as unknown as Record<string, unknown>),
      textStyles: normalizeTextStyles(tokens.textStyles as unknown as Record<string, unknown>),
    },
  };
}
