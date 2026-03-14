/**
 * Token Hero — Main thread entry point.
 *
 * This runs in the Figma plugin sandbox. No DOM, no WebSocket.
 * All communication with the UI goes through figma.ui.postMessage().
 */

import {
  handleReadPluginData,
  handleWritePluginData,
  handleReadClientStorage,
  handleWriteClientStorage,
} from './handlers/storage';
import { handleGetFileInfo } from './handlers/fileInfo';
import { handleReadFigmaStyles } from './handlers/readStyles';
import { handleGetStyleConsumers, clearConsumersCache } from './handlers/styleConsumers';
import { handleGetComponentProperties } from './handlers/componentProperties';
import { handleReadNodePluginData } from './handlers/nodeStorage';
import { handleWriteNodePluginData } from './handlers/writeNodePluginData';
import { handleExecuteSuggestedFix } from './handlers/executeFix';

// ── Show UI ──────────────────────────────────────────────────

figma.showUI(__html__, { width: 320, height: 300, themeColors: true });

// ── Push events → UI ─────────────────────────────────────────

figma.on('selectionchange', () => {
  const nodes = figma.currentPage.selection;
  figma.ui.postMessage({
    type: 'SELECTION_CHANGED',
    payload: {
      nodeIds: nodes.map((n) => n.id),
      nodeNames: nodes.map((n) => n.name),
      nodeTypes: nodes.map((n) => n.type),
    },
  });
});

function registerNodeChangeListener() {
  figma.currentPage.on('nodechange', ({ nodeChanges }) => {
    const propertyChanges = nodeChanges.filter((c) => c.type === 'PROPERTY_CHANGE');
    if (propertyChanges.length === 0) return;
    figma.ui.postMessage({
      type: 'DOCUMENT_CHANGED',
      payload: {
        changes: propertyChanges.map((c) => ({
          id: c.node.id,
          type: c.type,
          properties: c.properties,
        })),
      },
    });
  });
}

registerNodeChangeListener();

figma.on('currentpagechange', () => {
  registerNodeChangeListener();
  figma.ui.postMessage({
    type: 'SELECTION_CHANGED',
    payload: { nodeIds: [], nodeNames: [], nodeTypes: [] },
  });
});

figma.on('stylechange', () => {
  clearConsumersCache();
  figma.ui.postMessage({ type: 'STYLES_STALE' });
});

// ── Message router ───────────────────────────────────────────

// ── Cleanup on plugin close ─────────────────────────────────

figma.on('close', () => {
  figma.ui.postMessage({ type: 'PLUGIN_CLOSING' });
});

figma.ui.onmessage = (msg: { type: string; requestId?: string; [key: string]: unknown }) => {
  switch (msg.type) {
    case 'READ_PLUGIN_DATA':
      handleReadPluginData(msg as Parameters<typeof handleReadPluginData>[0]);
      break;
    case 'WRITE_PLUGIN_DATA':
      handleWritePluginData(msg as Parameters<typeof handleWritePluginData>[0]);
      break;
    case 'READ_CLIENT_STORAGE':
      handleReadClientStorage(msg as Parameters<typeof handleReadClientStorage>[0]);
      break;
    case 'WRITE_CLIENT_STORAGE':
      handleWriteClientStorage(msg as Parameters<typeof handleWriteClientStorage>[0]);
      break;
    case 'GET_FILE_INFO':
      handleGetFileInfo(msg as Parameters<typeof handleGetFileInfo>[0]);
      break;
    case 'READ_FIGMA_STYLES':
      handleReadFigmaStyles(msg as Parameters<typeof handleReadFigmaStyles>[0]);
      break;
    case 'GET_STYLE_CONSUMERS':
      handleGetStyleConsumers(msg as Parameters<typeof handleGetStyleConsumers>[0]);
      break;
    case 'GET_COMPONENT_PROPERTIES':
      handleGetComponentProperties(msg as Parameters<typeof handleGetComponentProperties>[0]);
      break;
    case 'READ_NODE_PLUGIN_DATA':
      handleReadNodePluginData(msg as Parameters<typeof handleReadNodePluginData>[0]);
      break;
    case 'WRITE_NODE_PLUGIN_DATA':
      handleWriteNodePluginData(msg as Parameters<typeof handleWriteNodePluginData>[0]);
      break;
    case 'EXECUTE_SUGGESTED_FIX':
      handleExecuteSuggestedFix(msg as Parameters<typeof handleExecuteSuggestedFix>[0]);
      break;
    case 'RESIZE':
      figma.ui.resize(
        (msg.width as number) ?? 320,
        (msg.height as number) ?? 480,
      );
      break;
  }
};
