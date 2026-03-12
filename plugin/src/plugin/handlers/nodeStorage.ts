/**
 * Node-level storage handler — reads pluginData from an arbitrary node.
 *
 * Unlike the root-level storage handler (storage.ts), this reads from a
 * specific node by ID. Used to retrieve component mappings stored via
 * componentNode.setPluginData("mapping").
 */

export interface NodeStorageRequest {
  type: 'READ_NODE_PLUGIN_DATA';
  requestId: string;
  nodeId: string;
  key: string;
}

export async function handleReadNodePluginData({ requestId, nodeId, key }: NodeStorageRequest) {
  let node: BaseNode | null;
  try {
    node = await figma.getNodeByIdAsync(nodeId);
  } catch (e) {
    node = null;
  }

  figma.ui.postMessage({
    type: 'READ_NODE_PLUGIN_DATA_RESULT',
    requestId,
    payload: {
      nodeId: nodeId,
      key: key,
      value: node ? node.getPluginData(key) || null : null,
    },
  });
}
