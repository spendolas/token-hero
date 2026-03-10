/**
 * Diff engine — compares Figma styles against code token snapshot.
 * Pure function, no side effects.
 */

import type {
  FigmaStylesPayload,
  DiffedToken,
  SectionSummary,
  TokenStatus,
} from '@shared/styleTypes';
import type { TokenGroupName, TokenSnapshotResultPayload, TextStyleToken, EffectToken } from '@shared/protocol';
import {
  formatTextStyle,
  formatTextStyleFromCode,
  formatColor,
  formatColorFromCode,
  formatEffect,
  formatEffectFromCode,
  formatNumeric,
  textStylesEqual,
  colorsEqual,
  effectsEqual,
  numericEqual,
} from './formatValues';

const GROUP_LABELS: Record<TokenGroupName, string> = {
  textStyles: 'Text Styles',
  colors: 'Colors',
  effects: 'Effects',
  spacing: 'Spacing',
  radius: 'Radius',
  sizes: 'Sizes',
};

export function diffAll(
  figma: FigmaStylesPayload,
  codeSnapshot: TokenSnapshotResultPayload | null,
  excludedTokens: string[],
  styleTimestamps: Record<string, number> = {},
  configWrittenAt: number | null = null,
): SectionSummary[] {
  const excluded = new Set(excludedTokens);
  const codeTokens = codeSnapshot?.tokens;
  const dir = (name: string) => resolveDriftDirection(name, styleTimestamps, configWrittenAt);

  return [
    diffTextStyles(figma, codeTokens?.textStyles ?? null, excluded, dir),
    diffColors(figma, codeTokens?.colors ?? null, excluded, dir),
    diffEffects(figma, codeTokens?.effects ?? null, excluded, dir),
    diffNumericGroup('spacing', figma.spacing, codeTokens?.spacing ?? null, excluded, dir),
    diffNumericGroup('radius', figma.radius, codeTokens?.radius ?? null, excluded, dir),
    diffNumericGroup('sizes', figma.sizes, codeTokens?.sizes ?? null, excluded, dir),
  ];
}

function resolveDriftDirection(
  tokenName: string,
  styleTimestamps: Record<string, number>,
  configWrittenAt: number | null,
): 'drifted_amber' | 'drifted_red' {
  const lastPushedAt = styleTimestamps[tokenName];
  if (!lastPushedAt) return 'drifted_amber';
  if (!configWrittenAt) return 'drifted_amber';
  if (lastPushedAt >= configWrittenAt) return 'drifted_amber';
  return 'drifted_red';
}

type DirFn = (name: string) => 'drifted_amber' | 'drifted_red';

function diffTextStyles(
  figma: FigmaStylesPayload,
  codeStyles: Record<string, TextStyleToken> | null,
  excluded: Set<string>,
  dir: DirFn,
): SectionSummary {
  const tokens: DiffedToken[] = [];
  const matched = new Set<string>();

  for (const style of figma.textStyles) {
    if (excluded.has(style.name)) {
      tokens.push({ id: style.id, name: style.name, group: 'textStyles', status: 'internal', figmaDisplayValue: formatTextStyle(style), codeDisplayValue: null });
      continue;
    }

    const figmaDisplay = formatTextStyle(style);
    const codeToken = codeStyles?.[style.name];

    if (!codeStyles) {
      tokens.push({ id: style.id, name: style.name, group: 'textStyles', status: 'unknown', figmaDisplayValue: figmaDisplay, codeDisplayValue: null });
    } else if (!codeToken) {
      tokens.push({ id: style.id, name: style.name, group: 'textStyles', status: 'unmapped', figmaDisplayValue: figmaDisplay, codeDisplayValue: null });
    } else {
      matched.add(style.name);
      const codeDisplay = formatTextStyleFromCode(codeToken);
      const status: TokenStatus = textStylesEqual(style, codeToken) ? 'clean' : dir(style.name);
      tokens.push({ id: style.id, name: style.name, group: 'textStyles', status, figmaDisplayValue: figmaDisplay, codeDisplayValue: codeDisplay });
    }
  }

  // Orphaned: in code but not in Figma
  if (codeStyles) {
    for (const name of Object.keys(codeStyles)) {
      if (!matched.has(name) && !excluded.has(name)) {
        const codeDisplay = formatTextStyleFromCode(codeStyles[name]);
        tokens.push({ id: `orphan:${name}`, name, group: 'textStyles', status: 'orphaned', figmaDisplayValue: '', codeDisplayValue: codeDisplay });
      }
    }
  }

  return buildSummary('textStyles', tokens);
}

function diffColors(
  figma: FigmaStylesPayload,
  codeColors: Record<string, string> | null,
  excluded: Set<string>,
  dir: DirFn,
): SectionSummary {
  const tokens: DiffedToken[] = [];
  const matched = new Set<string>();

  for (const color of figma.colors) {
    if (excluded.has(color.name)) {
      tokens.push({ id: color.id, name: color.name, group: 'colors', status: 'internal', figmaDisplayValue: formatColor(color.r, color.g, color.b, color.a), codeDisplayValue: null });
      continue;
    }

    const figmaDisplay = formatColor(color.r, color.g, color.b, color.a);
    const codeValue = codeColors?.[color.name];

    if (!codeColors) {
      tokens.push({ id: color.id, name: color.name, group: 'colors', status: 'unknown', figmaDisplayValue: figmaDisplay, codeDisplayValue: null });
    } else if (!codeValue) {
      tokens.push({ id: color.id, name: color.name, group: 'colors', status: 'unmapped', figmaDisplayValue: figmaDisplay, codeDisplayValue: null });
    } else {
      matched.add(color.name);
      const codeDisplay = formatColorFromCode(codeValue);
      const status: TokenStatus = colorsEqual(color, codeValue) ? 'clean' : dir(color.name);
      tokens.push({ id: color.id, name: color.name, group: 'colors', status, figmaDisplayValue: figmaDisplay, codeDisplayValue: codeDisplay });
    }
  }

  if (codeColors) {
    for (const name of Object.keys(codeColors)) {
      if (!matched.has(name) && !excluded.has(name)) {
        tokens.push({ id: `orphan:${name}`, name, group: 'colors', status: 'orphaned', figmaDisplayValue: '', codeDisplayValue: formatColorFromCode(codeColors[name]) });
      }
    }
  }

  return buildSummary('colors', tokens);
}

function diffEffects(
  figma: FigmaStylesPayload,
  codeEffects: Record<string, EffectToken> | null,
  excluded: Set<string>,
  dir: DirFn,
): SectionSummary {
  const tokens: DiffedToken[] = [];
  const matched = new Set<string>();

  for (const effect of figma.effects) {
    if (excluded.has(effect.name)) {
      const figmaDisplay = effect.effects.map(formatEffect).join(', ');
      tokens.push({ id: effect.id, name: effect.name, group: 'effects', status: 'internal', figmaDisplayValue: figmaDisplay, codeDisplayValue: null });
      continue;
    }

    const figmaDisplay = effect.effects.map(formatEffect).join(', ');
    const codeToken = codeEffects?.[effect.name];

    if (!codeEffects) {
      tokens.push({ id: effect.id, name: effect.name, group: 'effects', status: 'unknown', figmaDisplayValue: figmaDisplay, codeDisplayValue: null });
    } else if (!codeToken) {
      tokens.push({ id: effect.id, name: effect.name, group: 'effects', status: 'unmapped', figmaDisplayValue: figmaDisplay, codeDisplayValue: null });
    } else {
      matched.add(effect.name);
      const codeDisplay = formatEffectFromCode(codeToken);
      const isEqual = effect.effects.length === 1 && effectsEqual(effect.effects[0], codeToken);
      const status: TokenStatus = isEqual ? 'clean' : dir(effect.name);
      tokens.push({ id: effect.id, name: effect.name, group: 'effects', status, figmaDisplayValue: figmaDisplay, codeDisplayValue: codeDisplay });
    }
  }

  if (codeEffects) {
    for (const name of Object.keys(codeEffects)) {
      if (!matched.has(name) && !excluded.has(name)) {
        tokens.push({ id: `orphan:${name}`, name, group: 'effects', status: 'orphaned', figmaDisplayValue: '', codeDisplayValue: formatEffectFromCode(codeEffects[name]) });
      }
    }
  }

  return buildSummary('effects', tokens);
}

function diffNumericGroup(
  group: 'spacing' | 'radius' | 'sizes',
  figmaVars: FigmaStylesPayload['spacing'],
  codeValues: Record<string, number> | null,
  excluded: Set<string>,
  dir: DirFn,
): SectionSummary {
  const tokens: DiffedToken[] = [];
  const matched = new Set<string>();

  for (const v of figmaVars) {
    if (excluded.has(v.name)) {
      tokens.push({ id: v.id, name: v.name, group, status: 'internal', figmaDisplayValue: formatNumeric(v.value), codeDisplayValue: null });
      continue;
    }

    const figmaDisplay = formatNumeric(v.value);
    const codeValue = codeValues?.[v.name];

    if (!codeValues) {
      tokens.push({ id: v.id, name: v.name, group, status: 'unknown', figmaDisplayValue: figmaDisplay, codeDisplayValue: null });
    } else if (codeValue === undefined) {
      tokens.push({ id: v.id, name: v.name, group, status: 'unmapped', figmaDisplayValue: figmaDisplay, codeDisplayValue: null });
    } else {
      matched.add(v.name);
      const codeDisplay = formatNumeric(codeValue);
      const status: TokenStatus = numericEqual(v.value, codeValue) ? 'clean' : dir(v.name);
      tokens.push({ id: v.id, name: v.name, group, status, figmaDisplayValue: figmaDisplay, codeDisplayValue: codeDisplay });
    }
  }

  if (codeValues) {
    for (const name of Object.keys(codeValues)) {
      if (!matched.has(name) && !excluded.has(name)) {
        tokens.push({ id: `orphan:${name}`, name, group, status: 'orphaned', figmaDisplayValue: '', codeDisplayValue: formatNumeric(codeValues[name]) });
      }
    }
  }

  return buildSummary(group, tokens);
}

function buildSummary(group: TokenGroupName, tokens: DiffedToken[]): SectionSummary {
  let driftedCount = 0;
  let unmappedCount = 0;
  let orphanedCount = 0;

  for (const t of tokens) {
    if (t.status === 'drifted_amber' || t.status === 'drifted_red') driftedCount++;
    else if (t.status === 'unmapped') unmappedCount++;
    else if (t.status === 'orphaned') orphanedCount++;
  }

  return {
    group,
    label: GROUP_LABELS[group],
    total: tokens.length,
    driftedCount,
    unmappedCount,
    orphanedCount,
    tokens,
  };
}
