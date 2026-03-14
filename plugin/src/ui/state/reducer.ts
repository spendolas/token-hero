/**
 * Plugin state reducer — pure function, no side effects.
 */

import type { PluginState, PluginAction } from './types';
import type { HelloAckPayload } from '@shared/protocol';
import { DEFAULT_UI_PREFERENCES } from '@shared/constants';

export const initialState: PluginState = {
  connectionStatus: 'disconnected',
  projectName: null,
  projectRoot: null,
  versionMismatch: false,
  config: null,
  uiPrefs: DEFAULT_UI_PREFERENCES,
  selection: { nodeIds: [], nodeNames: [], nodeTypes: [] },
  activeTab: 'styles',
  fileInfo: null,
  figmaStyles: null,
  codeSnapshot: null,
  codeSnapshotFetchedAt: null,
  excludedTokens: [],
  stylesStale: false,
  styleTimestamps: {},
  configWrittenAt: null,
  pushQueue: [],
  pushInFlight: false,
  // Inspector tab
  inspectorData: null,
  inspectorMapping: null,
  inspectorLoading: false,
  inspectorError: null,
  inspectorNodeId: null,
  inspectorIsVariantChild: false,
  inspectorParentSetName: null,
  // Audit tab
  auditFindings: [],
  auditGeneratedAt: null,
  auditLoading: false,
  auditError: null,
  auditFixInFlight: null,
};

export function reducer(state: PluginState, action: PluginAction): PluginState {
  switch (action.type) {
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.status };

    case 'SET_HELLO_ACK': {
      const ack = action.payload as HelloAckPayload;
      return {
        ...state,
        connectionStatus: 'connected',
        projectName: ack.projectName,
        projectRoot: ack.projectRoot,
        versionMismatch: false,
      };
    }

    case 'SET_VERSION_MISMATCH':
      return { ...state, versionMismatch: true, connectionStatus: 'disconnected' };

    case 'SET_CONFIG':
      return { ...state, config: action.config };

    case 'SET_UI_PREFS':
      return { ...state, uiPrefs: { ...state.uiPrefs, ...action.prefs } };

    case 'SET_SELECTION':
      return { ...state, selection: action.selection };

    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.tab };

    case 'SET_FILE_INFO':
      return { ...state, fileInfo: action.fileInfo };

    case 'RESET_CONNECTION':
      return {
        ...state,
        connectionStatus: 'disconnected',
        projectName: null,
        projectRoot: null,
        versionMismatch: false,
      };

    case 'SET_FIGMA_STYLES':
      return { ...state, figmaStyles: action.styles, stylesStale: false };

    case 'SET_CODE_SNAPSHOT':
      return { ...state, codeSnapshot: action.snapshot, codeSnapshotFetchedAt: action.fetchedAt };

    case 'SET_EXCLUDED_TOKENS':
      return { ...state, excludedTokens: action.tokens };

    case 'SET_STYLES_STALE':
      return { ...state, stylesStale: true };

    case 'INVALIDATE_CODE_CACHE':
      return { ...state, codeSnapshot: null, codeSnapshotFetchedAt: null };

    case 'SET_STYLE_TIMESTAMPS':
      return { ...state, styleTimestamps: { ...state.styleTimestamps, ...action.timestamps } };

    case 'SET_CONFIG_WRITTEN_AT':
      return { ...state, configWrittenAt: action.configWrittenAt };

    case 'ENQUEUE_PUSH':
      return { ...state, pushQueue: [...state.pushQueue, action.item] };

    case 'PUSH_STARTED':
      return {
        ...state,
        pushInFlight: true,
        pushQueue: state.pushQueue.map((item) =>
          item.id === action.id ? { ...item, status: 'in_flight' as const } : item,
        ),
      };

    case 'PUSH_SUCCEEDED':
      return {
        ...state,
        pushInFlight: false,
        pushQueue: state.pushQueue.map((item) =>
          item.id === action.id ? { ...item, status: 'success' as const } : item,
        ),
      };

    case 'PUSH_FAILED':
      return {
        ...state,
        pushInFlight: false,
        pushQueue: state.pushQueue.map((item) =>
          item.id === action.id ? { ...item, status: 'error' as const, error: action.error } : item,
        ),
      };

    case 'CLEAR_COMPLETED_PUSHES':
      return { ...state, pushQueue: state.pushQueue.filter((item) => item.status !== 'success') };

    case 'SET_PROJECT_ROOT':
      return { ...state, projectRoot: action.projectRoot };

    // Inspector tab
    case 'SET_INSPECTOR_LOADING':
      return {
        ...state,
        inspectorLoading: true,
        inspectorError: null,
        inspectorNodeId: action.nodeId,
      };

    case 'SET_INSPECTOR_DATA':
      return {
        ...state,
        inspectorData: action.data,
        inspectorMapping: action.mapping,
        inspectorLoading: false,
        inspectorError: null,
        inspectorIsVariantChild: action.isVariantChild,
        inspectorParentSetName: action.parentSetName,
      };

    case 'SET_INSPECTOR_ERROR':
      return {
        ...state,
        inspectorLoading: false,
        inspectorError: action.error,
      };

    case 'CLEAR_INSPECTOR':
      return {
        ...state,
        inspectorData: null,
        inspectorMapping: null,
        inspectorLoading: false,
        inspectorError: null,
        inspectorNodeId: null,
        inspectorIsVariantChild: false,
        inspectorParentSetName: null,
      };

    // Audit tab
    case 'SET_AUDIT_FINDINGS':
      return {
        ...state,
        auditFindings: action.findings,
        auditGeneratedAt: action.generatedAt,
        auditLoading: false,
        auditError: null,
      };

    case 'CLEAR_AUDIT':
      return {
        ...state,
        auditFindings: [],
        auditGeneratedAt: null,
        auditLoading: false,
        auditError: null,
        auditFixInFlight: null,
      };

    case 'SET_AUDIT_ERROR':
      return {
        ...state,
        auditLoading: false,
        auditError: action.error,
      };

    case 'AUDIT_FIX_STARTED':
      return { ...state, auditFixInFlight: action.findingKey };

    case 'AUDIT_FIX_DONE':
      return { ...state, auditFixInFlight: null };

    case 'REMOVE_FINDING':
      return {
        ...state,
        auditFindings: state.auditFindings.filter(function (f) {
          return !(f.layerId === action.layerId && f.divergenceType === action.divergenceType);
        }),
      };

    default:
      return state;
  }
}
