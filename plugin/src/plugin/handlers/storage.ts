/**
 * Storage handlers — read/write pluginData and clientStorage.
 *
 * These run on the main thread where the Figma Plugin API is available.
 */

export interface StorageRequest {
  requestId: string;
  key: string;
  value?: string;
}

export function handleReadPluginData({ requestId, key }: StorageRequest) {
  const value = figma.root.getPluginData(key);
  figma.ui.postMessage({
    type: 'READ_PLUGIN_DATA_RESULT',
    requestId,
    payload: { key, value: value || null },
  });
}

export function handleWritePluginData({ requestId, key, value }: StorageRequest) {
  figma.root.setPluginData(key, value ?? '');
  figma.ui.postMessage({
    type: 'WRITE_PLUGIN_DATA_RESULT',
    requestId,
    payload: { key, success: true },
  });
}

export async function handleReadClientStorage({ requestId, key }: StorageRequest) {
  const value = await figma.clientStorage.getAsync(key);
  figma.ui.postMessage({
    type: 'READ_CLIENT_STORAGE_RESULT',
    requestId,
    payload: { key, value: value ?? null },
  });
}

export async function handleWriteClientStorage({ requestId, key, value }: StorageRequest) {
  await figma.clientStorage.setAsync(key, value);
  figma.ui.postMessage({
    type: 'WRITE_CLIENT_STORAGE_RESULT',
    requestId,
    payload: { key, success: true },
  });
}
