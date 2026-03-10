/**
 * Normalized Figma style/variable types (serializable across postMessage)
 * and diff result types for the Style Inspector tab.
 */

import type { TokenGroupName } from './protocol';

// ── Normalized Figma types ─────────────────────────────────────

export interface FigmaTextStyleInfo {
  id: string;
  name: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: string; // e.g. "Semi Bold", "Regular"
  lineHeight: { value: number; unit: 'PERCENT' | 'PIXELS' | 'AUTO' };
  letterSpacing: { value: number; unit: 'PERCENT' | 'PIXELS' };
  textCase: string; // e.g. "ORIGINAL", "UPPER", "LOWER"
}

export interface FigmaColorInfo {
  id: string;
  name: string;
  collectionName: string;
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaEffectDetail {
  type: string; // e.g. "DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR"
  color: { r: number; g: number; b: number; a: number };
  offset: { x: number; y: number };
  radius: number;
  spread: number;
}

export interface FigmaEffectInfo {
  id: string;
  name: string;
  effects: FigmaEffectDetail[];
}

export interface FigmaNumericVarInfo {
  id: string;
  name: string;
  collectionName: string;
  value: number;
}

export interface FigmaStylesPayload {
  readAt: number;
  textStyles: FigmaTextStyleInfo[];
  colors: FigmaColorInfo[];
  effects: FigmaEffectInfo[];
  spacing: FigmaNumericVarInfo[];
  radius: FigmaNumericVarInfo[];
  sizes: FigmaNumericVarInfo[];
}

// ── Diff result types ──────────────────────────────────────────

export type TokenStatus =
  | 'clean'
  | 'drifted_amber'
  | 'drifted_red'
  | 'unmapped'
  | 'orphaned'
  | 'internal'
  | 'unknown';

export interface DiffedToken {
  id: string;
  name: string;
  group: TokenGroupName;
  status: TokenStatus;
  figmaDisplayValue: string;
  codeDisplayValue: string | null;
}

export interface SectionSummary {
  group: TokenGroupName;
  label: string;
  total: number;
  driftedCount: number;
  unmappedCount: number;
  orphanedCount: number;
  tokens: DiffedToken[];
}

export type FilterMode = 'all' | 'drifted' | 'clean' | 'unmapped';
