/**
 * Node-level storage writer — writes pluginData to an arbitrary node.
 *
 * Counterpart to nodeStorage.ts (read). Used to persist audit findings
 * on component nodes via componentNode.setPluginData("auditFindings").
 */

export interface WriteNodeStorageRequest {
  type: 'WRITE_NODE_PLUGIN_DATA';
  requestId: string;
  nodeId: string;
  key: string;
  value: string;
}

export async function handleWriteNodePluginData({ requestId, nodeId, key, value }: WriteNodeStorageRequest) {
  let success = false;
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (node) {
      node.setPluginData(key, value);
      success = true;
    }
  } catch (e) {
    // Node not found or setPluginData failed
  }

  figma.ui.postMessage({
    type: 'WRITE_NODE_PLUGIN_DATA_RESULT',
    requestId,
    payload: { nodeId, key, success },
  });
}
