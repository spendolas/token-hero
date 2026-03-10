/**
 * READ_FIGMA_STYLES handler — reads all local styles and variables from Figma.
 */

import type {
  FigmaStylesPayload,
  FigmaTextStyleInfo,
  FigmaEffectInfo,
  FigmaEffectDetail,
  FigmaColorInfo,
  FigmaNumericVarInfo,
} from '@shared/styleTypes';

interface ReadStylesMsg {
  type: 'READ_FIGMA_STYLES';
  requestId?: string;
}

export async function handleReadFigmaStyles(msg: ReadStylesMsg) {
  const [textStyles, effectStyles, collections] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
  ]);

  // Normalize text styles
  const normalizedText: FigmaTextStyleInfo[] = textStyles.map((s) => {
    const lh = s.lineHeight as { value: number; unit: string } | { readonly type: 'AUTO' };
    let lineHeight: FigmaTextStyleInfo['lineHeight'];
    if ('type' in lh && lh.type === 'AUTO') {
      lineHeight = { value: 0, unit: 'AUTO' };
    } else {
      const lhTyped = lh as { value: number; unit: string };
      lineHeight = {
        value: lhTyped.value,
        unit: lhTyped.unit === 'PERCENT' ? 'PERCENT' : 'PIXELS',
      };
    }

    const ls = s.letterSpacing as { value: number; unit: string };
    return {
      id: s.id,
      name: s.name,
      fontSize: s.fontSize,
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      lineHeight,
      letterSpacing: {
        value: ls.value,
        unit: ls.unit === 'PERCENT' ? 'PERCENT' : 'PIXELS',
      },
      textCase: s.textCase || 'ORIGINAL',
    };
  });

  // Normalize effect styles
  const normalizedEffects: FigmaEffectInfo[] = effectStyles.map((s) => ({
    id: s.id,
    name: s.name,
    effects: s.effects.map((e): FigmaEffectDetail => ({
      type: e.type,
      color: e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR'
        ? { r: 0, g: 0, b: 0, a: 0 }
        : { r: (e as DropShadowEffect).color.r, g: (e as DropShadowEffect).color.g, b: (e as DropShadowEffect).color.b, a: (e as DropShadowEffect).color.a },
      offset: 'offset' in e ? { x: (e as DropShadowEffect).offset.x, y: (e as DropShadowEffect).offset.y } : { x: 0, y: 0 },
      radius: e.radius,
      spread: 'spread' in e ? (e as DropShadowEffect).spread : 0,
    })),
  }));

  // Read variables from collections
  const colors: FigmaColorInfo[] = [];
  const spacing: FigmaNumericVarInfo[] = [];
  const radius: FigmaNumericVarInfo[] = [];
  const sizes: FigmaNumericVarInfo[] = [];

  for (const collection of collections) {
    const variables = await Promise.all(
      collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
    );

    const defaultModeId = collection.modes[0]?.modeId;
    if (!defaultModeId) continue;

    const collectionName = collection.name;
    const group = classifyCollection(collectionName);

    for (const variable of variables) {
      if (!variable) continue;

      const value = variable.valuesByMode[defaultModeId];
      if (value === undefined) continue;

      // Skip variable aliases
      if (typeof value === 'object' && value !== null && 'type' in value) continue;

      if (variable.resolvedType === 'COLOR') {
        const c = value as RGBA;
        colors.push({
          id: variable.id,
          name: variable.name,
          collectionName,
          r: c.r,
          g: c.g,
          b: c.b,
          a: c.a,
        });
      } else if (variable.resolvedType === 'FLOAT') {
        const numVal = value as number;
        const info: FigmaNumericVarInfo = {
          id: variable.id,
          name: variable.name,
          collectionName,
          value: numVal,
        };

        switch (group) {
          case 'spacing': spacing.push(info); break;
          case 'radius': radius.push(info); break;
          case 'sizes': sizes.push(info); break;
          default: sizes.push(info); break; // fallback
        }
      }
    }
  }

  const payload: FigmaStylesPayload = {
    readAt: Date.now(),
    textStyles: normalizedText,
    colors,
    effects: normalizedEffects,
    spacing,
    radius,
    sizes,
  };

  figma.ui.postMessage({
    type: 'READ_FIGMA_STYLES_RESULT',
    requestId: msg.requestId,
    payload,
  });
}

/**
 * Classify a Figma collection name into a token group.
 * Normalizes name: lowercase, strip spaces, check for known group names.
 */
function classifyCollection(name: string): 'colors' | 'spacing' | 'radius' | 'sizes' {
  const normalized = name.toLowerCase().replace(/\s+/g, '');
  if (normalized.includes('spacing') || normalized.includes('space')) return 'spacing';
  if (normalized.includes('radius') || normalized.includes('corner')) return 'radius';
  if (normalized.includes('size') || normalized.includes('dimension')) return 'sizes';
  if (normalized.includes('color') || normalized.includes('colour')) return 'colors';
  return 'sizes'; // fallback
}
