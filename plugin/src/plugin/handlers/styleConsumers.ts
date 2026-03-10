/**
 * GET_STYLE_CONSUMERS handler — returns nodes that use a given style.
 */

interface StyleConsumersMsg {
  type: 'GET_STYLE_CONSUMERS';
  requestId?: string;
  styleId: string;
  styleType: 'TEXT' | 'EFFECT' | 'VARIABLE';
}

interface ConsumerInfo {
  nodeId: string;
  nodeName: string;
}

// Module-level cache, cleared on style changes
const consumersCache = new Map<string, ConsumerInfo[]>();

export function clearConsumersCache() {
  consumersCache.clear();
}

export async function handleGetStyleConsumers(msg: StyleConsumersMsg) {
  const { styleId, styleType, requestId } = msg;

  // Check cache
  if (consumersCache.has(styleId)) {
    figma.ui.postMessage({
      type: 'GET_STYLE_CONSUMERS_RESULT',
      requestId,
      payload: { consumers: consumersCache.get(styleId) },
    });
    return;
  }

  let consumers: ConsumerInfo[] = [];

  if (styleType === 'VARIABLE') {
    // No consumer API for variables yet
    consumers = [];
  } else {
    // Text or Effect style
    try {
      const style = await figma.getStyleByIdAsync(styleId);

      if (style) {
        const styleConsumers = await (style as TextStyle | EffectStyle).getStyleConsumersAsync();
        consumers = styleConsumers.map((c) => ({
          nodeId: c.node.id,
          nodeName: c.node.name,
        }));
      }
    } catch {
      // Style may have been deleted
    }
  }

  consumersCache.set(styleId, consumers);

  figma.ui.postMessage({
    type: 'GET_STYLE_CONSUMERS_RESULT',
    requestId,
    payload: { consumers },
  });
}
