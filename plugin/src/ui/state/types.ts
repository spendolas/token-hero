/**
 * Plugin UI state types.
 */

import type { ConnectionStatus } from '../bridge/wsBridge';
import type { PluginConfig, UIPreferences } from '@shared/config';
import type { HelloAckPayload, TokenSnapshotResultPayload, ApplyPatchPayload, ComponentPropertiesResultPayload } from '@shared/protocol';
import type { FigmaStylesPayload } from '@shared/styleTypes';

export type TabId = 'styles' | 'inspector' | 'audit' | 'settings';

export interface PushQueueItem {
  id: string;
  tokenNames: string[];
  payload: ApplyPatchPayload;
  status: 'pending' | 'in_flight' | 'success' | 'error';
  error?: string;
}

export interface SelectionInfo {
  nodeIds: string[];
  nodeNames: string[];
  nodeTypes: string[];
}

export interface PluginState {
  connectionStatus: ConnectionStatus;
  projectName: string | null;
  projectRoot: string | null;
  versionMismatch: boolean;
  config: PluginConfig | null;
  uiPrefs: UIPreferences;
  selection: SelectionInfo;
  activeTab: TabId;
  fileInfo: { figmaFileKey: string; figmaFileName: string } | null;
  figmaStyles: FigmaStylesPayload | null;
  codeSnapshot: TokenSnapshotResultPayload | null;
  codeSnapshotFetchedAt: number | null;
  excludedTokens: string[];
  stylesStale: boolean;
  styleTimestamps: Record<string, number>;
  configWrittenAt: number | null;
  pushQueue: PushQueueItem[];
  pushInFlight: boolean;
  // Inspector tab
  inspectorData: ComponentPropertiesResultPayload | null;
  inspectorMapping: string | null;
  inspectorLoading: boolean;
  inspectorError: string | null;
  inspectorNodeId: string | null;
  inspectorIsVariantChild: boolean;
  inspectorParentSetName: string | null;
}

export type PluginAction =
  | { type: 'SET_CONNECTION_STATUS'; status: ConnectionStatus }
  | { type: 'SET_HELLO_ACK'; payload: HelloAckPayload }
  | { type: 'SET_VERSION_MISMATCH' }
  | { type: 'SET_CONFIG'; config: PluginConfig }
  | { type: 'SET_UI_PREFS'; prefs: Partial<UIPreferences> }
  | { type: 'SET_SELECTION'; selection: SelectionInfo }
  | { type: 'SET_ACTIVE_TAB'; tab: TabId }
  | { type: 'SET_FILE_INFO'; fileInfo: { figmaFileKey: string; figmaFileName: string } }
  | { type: 'RESET_CONNECTION' }
  | { type: 'SET_FIGMA_STYLES'; styles: FigmaStylesPayload }
  | { type: 'SET_CODE_SNAPSHOT'; snapshot: TokenSnapshotResultPayload; fetchedAt: number }
  | { type: 'SET_EXCLUDED_TOKENS'; tokens: string[] }
  | { type: 'SET_STYLES_STALE' }
  | { type: 'INVALIDATE_CODE_CACHE' }
  | { type: 'SET_STYLE_TIMESTAMPS'; timestamps: Record<string, number> }
  | { type: 'SET_CONFIG_WRITTEN_AT'; configWrittenAt: number }
  | { type: 'ENQUEUE_PUSH'; item: PushQueueItem }
  | { type: 'PUSH_STARTED'; id: string }
  | { type: 'PUSH_SUCCEEDED'; id: string }
  | { type: 'PUSH_FAILED'; id: string; error: string }
  | { type: 'CLEAR_COMPLETED_PUSHES' }
  | { type: 'SET_PROJECT_ROOT'; projectRoot: string }
  // Inspector tab
  | { type: 'SET_INSPECTOR_LOADING'; nodeId: string }
  | { type: 'SET_INSPECTOR_DATA'; data: ComponentPropertiesResultPayload; mapping: string | null; isVariantChild: boolean; parentSetName: string | null }
  | { type: 'SET_INSPECTOR_ERROR'; error: string }
  | { type: 'CLEAR_INSPECTOR' };
