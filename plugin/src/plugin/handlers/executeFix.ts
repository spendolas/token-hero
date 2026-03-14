/**
 * Execute a suggested fix from audit findings.
 *
 * Handles rebind and create_token operations via the Figma Plugin API.
 * patch_json fixes are handled by the UI thread via Flow 2 (APPLY_PATCH).
 */

export interface ExecuteFixRequest {
  type: 'EXECUTE_SUGGESTED_FIX';
  requestId: string;
  layerId: string;
  fix: RebindFix | CreateTokenFix;
}

interface RebindFix {
  op: 'rebind';
  targetTokenName: string;
  targetTokenId: string;
  property: string;
}

interface CreateTokenFix {
  op: 'create_token';
  suggestedName: string;
  suggestedValue: string | number;
  collection: string;
}

export async function handleExecuteSuggestedFix({ requestId, layerId, fix }: ExecuteFixRequest) {
  try {
    const node = await figma.getNodeByIdAsync(layerId);
    if (!node) {
      postResult(requestId, false, 'Node not found: ' + layerId);
      return;
    }

    if (fix.op === 'rebind') {
      await executeRebind(node, fix);
      postResult(requestId, true, null);
    } else if (fix.op === 'create_token') {
      await executeCreateToken(node, fix);
      postResult(requestId, true, null);
    } else {
      postResult(requestId, false, 'Unknown fix op');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    postResult(requestId, false, msg);
  }
}

async function executeRebind(node: BaseNode, fix: RebindFix): Promise<void> {
  const variable = await figma.variables.getVariableByIdAsync(fix.targetTokenId);
  if (!variable) {
    throw new Error('Variable not found: ' + fix.targetTokenId);
  }

  // setBoundVariable is available on SceneNode types
  const sceneNode = node as SceneNode;
  if (typeof sceneNode.setBoundVariable !== 'function') {
    throw new Error('Node does not support variable binding');
  }

  // The property field maps to VariableBindableNodeField
  sceneNode.setBoundVariable(fix.property as VariableBindableNodeField, variable);
}

async function executeCreateToken(node: BaseNode, fix: CreateTokenFix): Promise<void> {
  // Find the target collection by name
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let collection = null;
  for (let i = 0; i < collections.length; i++) {
    if (collections[i].name === fix.collection) {
      collection = collections[i];
      break;
    }
  }

  if (!collection) {
    throw new Error('Collection not found: ' + fix.collection);
  }

  // Determine the resolved type from the value
  let resolvedType: VariableResolvedDataType = 'STRING';
  if (typeof fix.suggestedValue === 'number') {
    resolvedType = 'FLOAT';
  } else if (typeof fix.suggestedValue === 'string') {
    // Check if it looks like a color hex
    if (/^#[0-9a-fA-F]{6,8}$/.test(fix.suggestedValue)) {
      resolvedType = 'COLOR';
    }
  }

  const variable = figma.variables.createVariable(
    fix.suggestedName,
    collection,
    resolvedType,
  );

  // Set the value on the default mode
  const modeId = collection.modes[0].modeId;
  if (resolvedType === 'COLOR' && typeof fix.suggestedValue === 'string') {
    variable.setValueForMode(modeId, hexToRgba(fix.suggestedValue));
  } else {
    variable.setValueForMode(modeId, fix.suggestedValue);
  }
}

function hexToRgba(hex: string): RGBA {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1;
  return { r: r, g: g, b: b, a: a };
}

function postResult(requestId: string, success: boolean, error: string | null) {
  figma.ui.postMessage({
    type: 'EXECUTE_SUGGESTED_FIX_RESULT',
    requestId,
    payload: { success, error },
  });
}
