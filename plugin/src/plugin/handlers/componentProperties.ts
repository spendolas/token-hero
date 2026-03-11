/**
 * GET_COMPONENT_PROPERTIES handler — walks a component tree via Figma Plugin API
 * and returns layer-by-layer property bindings for audit script consumption.
 */

import type {
  Layer,
  LayerProperty,
  ComponentPropertiesResultPayload,
} from '@shared/protocol';

interface ComponentPropertiesMsg {
  type: 'GET_COMPONENT_PROPERTIES';
  requestId?: string;
  figmaNodeId: string;
}

export async function handleGetComponentProperties(msg: ComponentPropertiesMsg) {
  const { figmaNodeId, requestId } = msg;

  let node: BaseNode | null;
  try {
    node = await figma.getNodeByIdAsync(figmaNodeId);
  } catch {
    node = null;
  }

  if (!node) {
    figma.ui.postMessage({
      type: 'GET_COMPONENT_PROPERTIES_RESULT',
      requestId,
      payload: null,
      error: { code: 'NODE_NOT_FOUND', message: 'Node not found: ' + figmaNodeId },
    });
    return;
  }

  const isComponentSet = node.type === 'COMPONENT_SET';
  const isComponent = node.type === 'COMPONENT';

  if (!isComponent && !isComponentSet) {
    figma.ui.postMessage({
      type: 'GET_COMPONENT_PROPERTIES_RESULT',
      requestId,
      payload: null,
      error: { code: 'NODE_NOT_FOUND', message: 'Node is not a component: ' + node.type },
    });
    return;
  }

  const componentName = node.name;
  const fileKey = figma.fileKey || '';

  let result: ComponentPropertiesResultPayload;

  if (isComponentSet) {
    const setNode = node as ComponentSetNode;
    const variants: Record<string, { variantNodeId: string; layers: Layer[] }> = {};

    for (const child of setNode.children) {
      if (child.type !== 'COMPONENT') continue;
      const variantKey = buildVariantKey(child);
      const layers = await extractLayers(child);
      variants[variantKey] = { variantNodeId: child.id, layers };
    }

    result = {
      nodeId: figmaNodeId,
      componentName,
      figmaFileKey: fileKey,
      isComponentSet: true,
      variants,
    };
  } else {
    const layers = await extractLayers(node as ComponentNode);
    result = {
      nodeId: figmaNodeId,
      componentName,
      figmaFileKey: fileKey,
      isComponentSet: false,
      layers,
    };
  }

  figma.ui.postMessage({
    type: 'GET_COMPONENT_PROPERTIES_RESULT',
    requestId,
    payload: result,
  });
}

/**
 * Build a deterministic variant key from a ComponentNode's variant properties.
 * Sorted alphabetically, percent-encoded special chars.
 */
function buildVariantKey(component: ComponentNode): string {
  const parent = component.parent;
  if (!parent || parent.type !== 'COMPONENT_SET') return component.name;

  const propNames = Object.keys((parent as ComponentSetNode).componentPropertyDefinitions)
    .filter((name) => {
      const def = (parent as ComponentSetNode).componentPropertyDefinitions[name];
      return def.type === 'VARIANT';
    })
    .sort();

  const parts: string[] = [];
  for (const name of propNames) {
    const value = component.variantProperties?.[name] || '';
    const encodedName = name.replace(/%/g, '%25').replace(/=/g, '%3D').replace(/,/g, '%2C');
    const encodedValue = value.replace(/%/g, '%25').replace(/=/g, '%3D').replace(/,/g, '%2C');
    parts.push(encodedName + '=' + encodedValue);
  }
  return parts.join(',');
}

/**
 * Walk the subtree of a component and extract layer property bindings.
 */
async function extractLayers(root: ComponentNode): Promise<Layer[]> {
  const layers: Layer[] = [];
  await walkNode(root, layers);
  return layers;
}

async function walkNode(node: SceneNode, layers: Layer[]) {
  const properties: Record<string, LayerProperty> = {};
  let hasProps = false;

  // Fills
  if ('fills' in node && Array.isArray(node.fills)) {
    const fills = node.fills as ReadonlyArray<Paint>;
    if (fills.length > 0) {
      const bound = await getBoundVariable(node, 'fills');
      const value = describeFills(fills);
      properties['fill'] = {
        value,
        tokenId: bound?.id || null,
        tokenName: bound?.name || null,
        isBound: bound !== null,
        isOverridden: false,
      };
      hasProps = true;
    }
  }

  // Strokes
  if ('strokes' in node && Array.isArray(node.strokes)) {
    const strokes = node.strokes as ReadonlyArray<Paint>;
    if (strokes.length > 0) {
      const bound = await getBoundVariable(node, 'strokes');
      const value = describeFills(strokes);
      properties['stroke'] = {
        value,
        tokenId: bound?.id || null,
        tokenName: bound?.name || null,
        isBound: bound !== null,
        isOverridden: false,
      };
      hasProps = true;
    }
  }

  // Text properties
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;

    const fontSizeBound = await getBoundVariable(node, 'fontSize');
    properties['fontSize'] = {
      value: typeof textNode.fontSize === 'number' ? textNode.fontSize : 0,
      tokenId: fontSizeBound?.id || null,
      tokenName: fontSizeBound?.name || null,
      isBound: fontSizeBound !== null,
      isOverridden: false,
    };

    const lineHeightBound = await getBoundVariable(node, 'lineHeight');
    const lh = textNode.lineHeight as { value: number; unit: string } | { readonly type: 'AUTO' };
    const lhValue = 'type' in lh && lh.type === 'AUTO' ? 'AUTO' : (lh as { value: number }).value;
    properties['lineHeight'] = {
      value: lhValue,
      tokenId: lineHeightBound?.id || null,
      tokenName: lineHeightBound?.name || null,
      isBound: lineHeightBound !== null,
      isOverridden: false,
    };

    const letterSpacingBound = await getBoundVariable(node, 'letterSpacing');
    const ls = textNode.letterSpacing as { value: number; unit: string };
    properties['letterSpacing'] = {
      value: ls.value,
      tokenId: letterSpacingBound?.id || null,
      tokenName: letterSpacingBound?.name || null,
      isBound: letterSpacingBound !== null,
      isOverridden: false,
    };

    const fontWeightBound = await getBoundVariable(node, 'fontWeight');
    properties['fontWeight'] = {
      value: fontNameToWeight(textNode.fontName as FontName),
      tokenId: fontWeightBound?.id || null,
      tokenName: fontWeightBound?.name || null,
      isBound: fontWeightBound !== null,
      isOverridden: false,
    };

    hasProps = true;
  }

  // Layout: padding, spacing
  if ('paddingTop' in node) {
    const frameNode = node as FrameNode;
    for (const side of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const) {
      const bound = await getBoundVariable(node, side);
      properties[side] = {
        value: frameNode[side],
        tokenId: bound?.id || null,
        tokenName: bound?.name || null,
        isBound: bound !== null,
        isOverridden: false,
      };
    }
    hasProps = true;
  }

  if ('itemSpacing' in node) {
    const bound = await getBoundVariable(node, 'itemSpacing');
    properties['itemSpacing'] = {
      value: (node as FrameNode).itemSpacing,
      tokenId: bound?.id || null,
      tokenName: bound?.name || null,
      isBound: bound !== null,
      isOverridden: false,
    };
    hasProps = true;
  }

  // Corner radius
  if ('cornerRadius' in node) {
    const bound = await getBoundVariable(node, 'topLeftRadius');
    const crNode = node as RectangleNode;
    const radius = typeof crNode.cornerRadius === 'number' ? crNode.cornerRadius : 0;
    properties['cornerRadius'] = {
      value: radius,
      tokenId: bound?.id || null,
      tokenName: bound?.name || null,
      isBound: bound !== null,
      isOverridden: false,
    };
    hasProps = true;
  }

  // Opacity
  if ('opacity' in node && typeof node.opacity === 'number' && node.opacity < 1) {
    const bound = await getBoundVariable(node, 'opacity');
    properties['opacity'] = {
      value: node.opacity,
      tokenId: bound?.id || null,
      tokenName: bound?.name || null,
      isBound: bound !== null,
      isOverridden: false,
    };
    hasProps = true;
  }

  // Width/Height (only for explicitly sized nodes)
  if ('layoutSizingHorizontal' in node) {
    const frameNode = node as FrameNode;
    if (frameNode.layoutSizingHorizontal === 'FIXED') {
      const bound = await getBoundVariable(node, 'width');
      properties['width'] = {
        value: frameNode.width,
        tokenId: bound?.id || null,
        tokenName: bound?.name || null,
        isBound: bound !== null,
        isOverridden: false,
      };
      hasProps = true;
    }
    if (frameNode.layoutSizingVertical === 'FIXED') {
      const bound = await getBoundVariable(node, 'height');
      properties['height'] = {
        value: frameNode.height,
        tokenId: bound?.id || null,
        tokenName: bound?.name || null,
        isBound: bound !== null,
        isOverridden: false,
      };
      hasProps = true;
    }
  }

  if (hasProps) {
    layers.push({
      layerId: node.id,
      layerName: node.name,
      properties,
    });
  }

  // Recurse children
  if ('children' in node) {
    for (const child of (node as ChildrenMixin & SceneNode).children) {
      await walkNode(child, layers);
    }
  }
}

/**
 * Check if a node property has a bound variable. Returns variable info or null.
 */
async function getBoundVariable(
  node: SceneNode,
  property: string,
): Promise<{ id: string; name: string } | null> {
  try {
    const bindings = (node as SceneNode & { boundVariables?: Record<string, VariableAlias | VariableAlias[]> }).boundVariables;
    if (!bindings) return null;

    const binding = bindings[property];
    if (!binding) return null;

    // Some properties (fills, strokes) have array bindings
    const alias = Array.isArray(binding) ? binding[0] : binding;
    if (!alias || !alias.id) return null;

    const variable = await figma.variables.getVariableByIdAsync(alias.id);
    if (!variable) return null;

    return { id: variable.id, name: variable.name };
  } catch {
    return null;
  }
}

/**
 * Describe fills as a CSS-like color string.
 */
function describeFills(fills: ReadonlyArray<Paint>): string {
  const visible = fills.filter((f) => f.visible !== false);
  if (visible.length === 0) return 'none';
  const first = visible[0];
  if (first.type === 'SOLID') {
    const c = first.color;
    const a = first.opacity !== undefined ? first.opacity : 1;
    return rgbaToHex(c.r, c.g, c.b, a);
  }
  return first.type.toLowerCase();
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  const hex = '#' + toHex(r) + toHex(g) + toHex(b);
  if (a < 1) return hex + toHex(a);
  return hex;
}

function fontNameToWeight(fontName: FontName): number {
  const style = (fontName.style || '').toLowerCase();
  if (style.includes('thin') || style.includes('hairline')) return 100;
  if (style.includes('extralight') || style.includes('ultralight')) return 200;
  if (style.includes('light')) return 300;
  if (style.includes('medium')) return 500;
  if (style.includes('semibold') || style.includes('demibold')) return 600;
  if (style.includes('extrabold') || style.includes('ultrabold')) return 800;
  if (style.includes('bold')) return 700;
  if (style.includes('black') || style.includes('heavy')) return 900;
  return 400; // Regular/Normal
}
