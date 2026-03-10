/**
 * Patch builder — converts drifted tokens into RFC 6902 APPLY_PATCH payloads.
 * Pure functions, no side effects.
 */

import type { FigmaStylesPayload, DiffedToken, SectionSummary } from '@shared/styleTypes';
import type { ApplyPatchPayload, PatchOperation } from '@shared/protocol';
import type { PluginConfig } from '@shared/config';
import { textStyleToCode, colorInfoToCode, effectToCode, numericToCode } from './figmaToCode';

// ── JSON Pointer escaping (RFC 6901) ──────────────────────

export function escapeJsonPointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

// ── Single token → PatchOperation ─────────────────────────

function buildOperation(
  token: DiffedToken,
  figmaStyles: FigmaStylesPayload,
): PatchOperation | null {
  const op = token.status === 'unmapped' ? 'add' as const : 'replace' as const;
  const escapedName = escapeJsonPointer(token.name);
  const path = `/${token.group}/${escapedName}`;

  switch (token.group) {
    case 'textStyles': {
      const info = figmaStyles.textStyles.find((s) => s.name === token.name);
      if (!info) return null;
      return { op, path, value: textStyleToCode(info) };
    }
    case 'colors': {
      const info = figmaStyles.colors.find((c) => c.name === token.name);
      if (!info) return null;
      return { op, path, value: colorInfoToCode(info) };
    }
    case 'effects': {
      const info = figmaStyles.effects.find((e) => e.name === token.name);
      if (!info || info.effects.length !== 1) return null; // skip multi-effect styles
      return { op, path, value: effectToCode(info.effects[0]) };
    }
    case 'spacing':
    case 'radius':
    case 'sizes': {
      const arr = figmaStyles[token.group as 'spacing' | 'radius' | 'sizes'];
      const info = arr.find((v) => v.name === token.name);
      if (!info) return null;
      return { op, path, value: numericToCode(info.value) };
    }
    default:
      return null;
  }
}

// ── Helpers ───────────────────────────────────────────────

function makePayload(
  operations: PatchOperation[],
  config: PluginConfig,
): ApplyPatchPayload | null {
  if (operations.length === 0) return null;
  return {
    targetFile: config.pipeline.sourceFile,
    patch: operations,
    runAfter: config.pipeline.generateCommand ? [config.pipeline.generateCommand] : [],
  };
}

function isDrifted(token: DiffedToken): boolean {
  return token.status === 'drifted_amber' || token.status === 'drifted_red';
}

// ── Public API ────────────────────────────────────────────

export function buildPatchForToken(
  token: DiffedToken,
  figmaStyles: FigmaStylesPayload,
  config: PluginConfig,
): ApplyPatchPayload | null {
  if (!isDrifted(token) && token.status !== 'unmapped') return null;
  const op = buildOperation(token, figmaStyles);
  if (!op) return null;
  return makePayload([op], config);
}

export function buildPatchForSection(
  tokens: DiffedToken[],
  figmaStyles: FigmaStylesPayload,
  config: PluginConfig,
): ApplyPatchPayload | null {
  const ops: PatchOperation[] = [];
  for (const token of tokens) {
    if (!isDrifted(token)) continue;
    const op = buildOperation(token, figmaStyles);
    if (op) ops.push(op);
  }
  return makePayload(ops, config);
}

export function buildPatchForAll(
  sections: SectionSummary[],
  figmaStyles: FigmaStylesPayload,
  config: PluginConfig,
): ApplyPatchPayload | null {
  const ops: PatchOperation[] = [];
  for (const section of sections) {
    for (const token of section.tokens) {
      if (!isDrifted(token)) continue;
      const op = buildOperation(token, figmaStyles);
      if (op) ops.push(op);
    }
  }
  return makePayload(ops, config);
}
