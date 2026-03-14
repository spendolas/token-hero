/**
 * PluginContext — React context + provider that wires together
 * the plugin bridge, WebSocket bridge, and state reducer.
 */

import { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { PluginState, PluginAction, TabId, SelectionInfo, PushQueueItem } from './types';
import { reducer, initialState } from './reducer';
import { DEFAULT_CONFIG, DEFAULT_UI_PREFERENCES, PLUGIN_VERSION } from '@shared/constants';
import type { PluginConfig } from '@shared/config';
import type { HelloAckPayload, MessageType, TokenSnapshotResultPayload, ApplyPatchPayload, PatchResultPayload, ErrorPayload, PickFolderResultPayload, GetComponentPropertiesPayload, ComponentPropertiesResultPayload, AuditResultsPayload, AuditFinding, DivergenceType } from '@shared/protocol';
import type { FigmaStylesPayload } from '@shared/styleTypes';
import { isSnapshotStale } from '../logic/snapshotCache';
import { normalizeSnapshot } from '../logic/normalizeSnapshot';
import * as pluginBridge from '../bridge/pluginBridge';
import * as wsBridge from '../bridge/wsBridge';

// ── Helpers ──────────────────────────────────────────────────

function executeFixesSerially(
  findings: AuditFinding[],
  idx: number,
  divergenceType: DivergenceType,
  dispatch: React.Dispatch<PluginAction>,
) {
  if (idx >= findings.length) {
    dispatch({ type: 'AUDIT_FIX_DONE' });
    return;
  }
  const finding = findings[idx];
  dispatch({ type: 'AUDIT_FIX_STARTED', findingKey: finding.layerId + ':' + finding.divergenceType });
  pluginBridge
    .request<{ success: boolean; error: string | null }>(
      'EXECUTE_SUGGESTED_FIX',
      { layerId: finding.layerId, fix: finding.suggestedFix },
      15000,
    )
    .then(function (result) {
      if (result && result.success) {
        dispatch({ type: 'REMOVE_FINDING', layerId: finding.layerId, divergenceType: divergenceType });
      }
      executeFixesSerially(findings, idx + 1, divergenceType, dispatch);
    })
    .catch(function () {
      executeFixesSerially(findings, idx + 1, divergenceType, dispatch);
    });
}

// ── Context ──────────────────────────────────────────────────

interface PluginContextValue {
  state: PluginState;
  dispatch: React.Dispatch<PluginAction>;
  setActiveTab: (tab: TabId) => void;
  saveConfig: (config: PluginConfig) => void;
  refreshStyles: (force?: boolean) => void;
  pushToCode: (payload: ApplyPatchPayload, tokenNames: string[]) => void;
  pickFolder: () => void;
  scanComponent: (nodeId: string) => void;
  executeFix: (finding: AuditFinding) => void;
  executeFixAll: (divergenceType: DivergenceType) => void;
  runAudit: () => void;
}

const PluginCtx = createContext<PluginContextValue | null>(null);

export function usePlugin(): PluginContextValue {
  const ctx = useContext(PluginCtx);
  if (!ctx) throw new Error('usePlugin must be used within PluginProvider');
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────

export function PluginProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Boot sequence (runs once) ──────────────────────────────

  useEffect(() => {
    pluginBridge.init();

    let disposed = false;

    async function boot() {
      // 1. Load UI preferences from clientStorage
      try {
        const prefsRaw = await pluginBridge.request<{ value: string | null }>(
          'READ_CLIENT_STORAGE',
          { key: 'uiPreferences' },
        );
        if (prefsRaw?.value) {
          const prefs = JSON.parse(prefsRaw.value);
          dispatch({ type: 'SET_UI_PREFS', prefs });
          if (prefs.panelTab) {
            dispatch({ type: 'SET_ACTIVE_TAB', tab: prefs.panelTab });
          }
        }
      } catch {
        // First run — use defaults
      }

      // 2. Load config from pluginData
      let config: PluginConfig | null = null;
      try {
        const configRaw = await pluginBridge.request<{ value: string | null }>(
          'READ_PLUGIN_DATA',
          { key: 'config' },
        );
        if (configRaw?.value) {
          config = JSON.parse(configRaw.value);
          dispatch({ type: 'SET_CONFIG', config: config! });
        }
      } catch {
        // No config yet
      }

      // 3. Load excluded tokens from pluginData
      try {
        const excludedRaw = await pluginBridge.request<{ value: string | null }>(
          'READ_PLUGIN_DATA',
          { key: 'excludedTokens' },
        );
        if (excludedRaw?.value) {
          dispatch({ type: 'SET_EXCLUDED_TOKENS', tokens: JSON.parse(excludedRaw.value) });
        }
      } catch {
        // No excluded tokens yet
      }

      // 4. Load projectRoot from pluginData
      let savedRoot: string | null = null;
      try {
        const rootRaw = await pluginBridge.request<{ value: string | null }>(
          'READ_PLUGIN_DATA',
          { key: 'projectRoot' },
        );
        if (rootRaw?.value) {
          savedRoot = rootRaw.value;
          dispatch({ type: 'SET_PROJECT_ROOT', projectRoot: rootRaw.value });
        }
      } catch {
        // No saved project root
      }

      // 5. Load styleTimestamps from pluginData
      try {
        const tsRaw = await pluginBridge.request<{ value: string | null }>(
          'READ_PLUGIN_DATA',
          { key: 'styleTimestamps' },
        );
        if (tsRaw?.value) {
          dispatch({ type: 'SET_STYLE_TIMESTAMPS', timestamps: JSON.parse(tsRaw.value) });
        }
      } catch {
        // No timestamps yet
      }

      // 6. Get file info
      try {
        const fileInfo = await pluginBridge.request<{
          figmaFileKey: string;
          figmaFileName: string;
        }>('GET_FILE_INFO');
        if (!disposed) {
          dispatch({ type: 'SET_FILE_INFO', fileInfo });
        }
      } catch {
        // File info unavailable
      }

      // 7. Auto-navigate to Settings if no config
      if (!config) {
        dispatch({ type: 'SET_ACTIVE_TAB', tab: 'settings' });
      }

      // 8. Attempt WebSocket connection
      if (!disposed) {
        const port = config?.bridgePort ?? DEFAULT_CONFIG.bridgePort;
        const fileInfoState = state.fileInfo;
        wsBridge.connect(port, {
          pluginVersion: PLUGIN_VERSION,
          figmaFileKey: fileInfoState?.figmaFileKey ?? '',
          figmaFileName: fileInfoState?.figmaFileName ?? '',
          ...(savedRoot && { projectRoot: savedRoot }),
        });
      }
    }

    boot();

    // ── Subscribe to plugin push events ──────────────────────

    const unsubSelection = pluginBridge.on('SELECTION_CHANGED', (payload) => {
      dispatch({ type: 'SET_SELECTION', selection: payload as SelectionInfo });
    });

    const unsubDocChange = pluginBridge.on('DOCUMENT_CHANGED', (_payload) => {
      // Future: handle document change events (e.g., refresh audit state)
    });

    const unsubStylesStale = pluginBridge.on('STYLES_STALE', () => {
      dispatch({ type: 'SET_STYLES_STALE' });
    });

    const unsubClosing = pluginBridge.on('PLUGIN_CLOSING', () => {
      wsBridge.disconnect();
    });

    // ── Subscribe to WebSocket events ────────────────────────

    const unsubWsStatus = wsBridge.onStatus((wsStatus) => {
      dispatch({ type: 'SET_CONNECTION_STATUS', status: wsStatus });
    });

    const unsubWsMessage = wsBridge.onMessage((type: MessageType, payload: unknown) => {
      switch (type) {
        case 'HELLO_ACK': {
          const ack = payload as HelloAckPayload;
          dispatch({ type: 'SET_HELLO_ACK', payload: ack });
          dispatch({ type: 'INVALIDATE_CODE_CACHE' });
          if (ack.configWrittenAt) {
            dispatch({ type: 'SET_CONFIG_WRITTEN_AT', configWrittenAt: ack.configWrittenAt });
          }
          break;
        }
        case 'VERSION_MISMATCH':
          dispatch({ type: 'SET_VERSION_MISMATCH' });
          break;
        case 'PICK_FOLDER_RESULT': {
          const result = payload as PickFolderResultPayload;
          if (result.path) {
            dispatch({ type: 'SET_PROJECT_ROOT', projectRoot: result.path });
            pluginBridge.request('WRITE_PLUGIN_DATA', {
              key: 'projectRoot',
              value: result.path,
            }).catch(() => {});
          }
          break;
        }
        case 'AUDIT_RESULTS': {
          const auditPayload = payload as AuditResultsPayload;
          if (auditPayload.replaceExisting) {
            dispatch({ type: 'CLEAR_AUDIT' });
          }
          dispatch({
            type: 'SET_AUDIT_FINDINGS',
            findings: auditPayload.findings,
            generatedAt: auditPayload.generatedAt,
          });
          // Persist findings to pluginData per component
          const byNode: Record<string, AuditFinding[]> = {};
          for (let i = 0; i < auditPayload.findings.length; i++) {
            const f = auditPayload.findings[i];
            if (!byNode[f.figmaNodeId]) {
              byNode[f.figmaNodeId] = [];
            }
            byNode[f.figmaNodeId].push(f);
          }
          const nodeIds = Object.keys(byNode);
          for (let i = 0; i < nodeIds.length; i++) {
            pluginBridge.request('WRITE_NODE_PLUGIN_DATA', {
              nodeId: nodeIds[i],
              key: 'auditFindings',
              value: JSON.stringify(byNode[nodeIds[i]]),
            }).catch(function () {});
          }
          break;
        }
        case 'GET_COMPONENT_PROPERTIES': {
          const props = payload as GetComponentPropertiesPayload;
          pluginBridge
            .request<ComponentPropertiesResultPayload>(
              'GET_COMPONENT_PROPERTIES',
              { figmaNodeId: props.figmaNodeId },
              props.timeoutMs ?? 10000,
            )
            .then((result) => {
              wsBridge.sendMessage('COMPONENT_PROPERTIES_RESULT', result);
            })
            .catch(() => {
              // Plugin couldn't process — bridge timeout will handle it
            });
          break;
        }
      }
    });

    return () => {
      disposed = true;
      unsubSelection();
      unsubDocChange();
      unsubStylesStale();
      unsubClosing();
      unsubWsStatus();
      unsubWsMessage();
      wsBridge.disconnect();
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────

  const setActiveTab = useCallback(
    (tab: TabId) => {
      dispatch({ type: 'SET_ACTIVE_TAB', tab });
      // Persist tab preference
      const prefs = { ...DEFAULT_UI_PREFERENCES, panelTab: tab };
      pluginBridge.request('WRITE_CLIENT_STORAGE', {
        key: 'uiPreferences',
        value: JSON.stringify(prefs),
      }).catch(() => {});
    },
    [],
  );

  const refreshStyles = useCallback(
    (force = false) => {
      // 1. Request Figma styles from main thread
      pluginBridge.request<FigmaStylesPayload>('READ_FIGMA_STYLES').then(
        (styles) => { dispatch({ type: 'SET_FIGMA_STYLES', styles }); },
        () => { /* read failed — keep existing */ },
      );

      // 2. Fetch code snapshot if connected and stale (or forced)
      const s = stateRef.current;
      if (wsBridge.getStatus() === 'connected' && (force || isSnapshotStale(s.codeSnapshotFetchedAt))) {
        wsBridge.sendMessage('GET_TOKEN_SNAPSHOT', {});
      }
    },
    [],
  );

  // Listen for TOKEN_SNAPSHOT_RESULT (separate from boot effect so it persists)
  useEffect(() => {
    const unsub = wsBridge.onMessage((type: MessageType, payload: unknown) => {
      if (type === 'TOKEN_SNAPSHOT_RESULT') {
        const normalized = normalizeSnapshot(payload as TokenSnapshotResultPayload);
        dispatch({
          type: 'SET_CODE_SNAPSHOT',
          snapshot: normalized,
          fetchedAt: Date.now(),
        });
      }
    });
    return unsub;
  }, []);

  // ── Push to code ─────────────────────────────────────────

  let pushIdCounter = 0;

  const processPushQueue = useCallback(() => {
    const s = stateRef.current;
    if (s.pushInFlight) return;
    const next = s.pushQueue.find((item) => item.status === 'pending');
    if (!next) return;
    dispatch({ type: 'PUSH_STARTED', id: next.id });
    wsBridge.sendMessage('APPLY_PATCH', next.payload);
  }, []);

  const pushToCode = useCallback(
    (payload: ApplyPatchPayload, tokenNames: string[]) => {
      const item: PushQueueItem = {
        id: `push_${++pushIdCounter}_${Date.now()}`,
        tokenNames,
        payload,
        status: 'pending',
      };
      dispatch({ type: 'ENQUEUE_PUSH', item });
      // processPushQueue will be called via the effect below
    },
    [],
  );

  // Process queue whenever pushQueue or pushInFlight changes
  useEffect(() => {
    if (!state.pushInFlight && state.pushQueue.some((item) => item.status === 'pending')) {
      processPushQueue();
    }
  }, [state.pushQueue, state.pushInFlight, processPushQueue]);

  // Listen for PATCH_RESULT and ERROR
  useEffect(() => {
    const unsub = wsBridge.onMessage((type: MessageType, payload: unknown) => {
      if (type === 'PATCH_RESULT') {
        const result = payload as PatchResultPayload;
        const s = stateRef.current;
        const inFlight = s.pushQueue.find((item) => item.status === 'in_flight');
        if (!inFlight) return;

        if (result.success) {
          dispatch({ type: 'PUSH_SUCCEEDED', id: inFlight.id });
          // Update styleTimestamps for pushed tokens
          const now = Date.now();
          const timestamps: Record<string, number> = {};
          for (const name of inFlight.tokenNames) {
            timestamps[name] = now;
          }
          dispatch({ type: 'SET_STYLE_TIMESTAMPS', timestamps });
          // Persist timestamps
          const merged = { ...stateRef.current.styleTimestamps, ...timestamps };
          pluginBridge.request('WRITE_PLUGIN_DATA', {
            key: 'styleTimestamps',
            value: JSON.stringify(merged),
          }).catch(() => {});
          // Invalidate cache and refresh
          dispatch({ type: 'INVALIDATE_CODE_CACHE' });
          refreshStyles(true);
        } else {
          const errorMsg = result.commandResults
            ?.filter((r) => r.exitCode !== 0)
            .map((r) => r.stderr || `Command failed: ${r.command}`)
            .join('; ') || 'Patch failed';
          dispatch({ type: 'PUSH_FAILED', id: inFlight.id, error: errorMsg });
        }
      }

      if (type === 'ERROR') {
        const err = payload as ErrorPayload;
        if (err.code === 'PATCH_FAILED' || err.code === 'PATCH_TARGET_INVALID') {
          const s = stateRef.current;
          const inFlight = s.pushQueue.find((item) => item.status === 'in_flight');
          if (inFlight) {
            dispatch({ type: 'PUSH_FAILED', id: inFlight.id, error: err.message });
          }
        }
      }
    });
    return unsub;
  }, [refreshStyles]);

  const pickFolder = useCallback(() => {
    wsBridge.sendMessage('PICK_FOLDER', {});
  }, []);

  const scanComponent = useCallback(
    (nodeId: string) => {
      dispatch({ type: 'SET_INSPECTOR_LOADING', nodeId: nodeId });
      pluginBridge
        .request<ComponentPropertiesResultPayload>(
          'GET_COMPONENT_PROPERTIES',
          { figmaNodeId: nodeId },
          10000,
        )
        .then(function (result) {
          // Guard stale: if the user changed selection while we were scanning, discard
          if (stateRef.current.inspectorNodeId !== nodeId) return;

          if (!result) {
            dispatch({ type: 'SET_INSPECTOR_ERROR', error: 'Component not found' });
            return;
          }

          // Read mapping from the appropriate node (parent set for variant children)
          let mappingNodeId = nodeId;
          if (result.parentSetId) {
            mappingNodeId = result.parentSetId;
          }

          pluginBridge
            .request<{ value: string | null }>(
              'READ_NODE_PLUGIN_DATA',
              { nodeId: mappingNodeId, key: 'mapping' },
            )
            .then(function (mappingResult) {
              if (stateRef.current.inspectorNodeId !== nodeId) return;
              dispatch({
                type: 'SET_INSPECTOR_DATA',
                data: result,
                mapping: (mappingResult && mappingResult.value) ? mappingResult.value : null,
                isVariantChild: !!result.parentSetId,
                parentSetName: result.parentSetName || null,
              });
            })
            .catch(function () {
              if (stateRef.current.inspectorNodeId !== nodeId) return;
              // Mapping read failed — still show data without mapping
              dispatch({
                type: 'SET_INSPECTOR_DATA',
                data: result,
                mapping: null,
                isVariantChild: !!result.parentSetId,
                parentSetName: result.parentSetName || null,
              });
            });
        })
        .catch(function () {
          if (stateRef.current.inspectorNodeId !== nodeId) return;
          dispatch({ type: 'SET_INSPECTOR_ERROR', error: 'Failed to scan component' });
        });
    },
    [],
  );

  // ── Audit fix execution ──────────────────────────────────

  const executeFix = useCallback(
    function (finding: AuditFinding) {
      if (!finding.suggestedFix) return;
      const fix = finding.suggestedFix;
      const key = finding.layerId + ':' + finding.divergenceType;
      dispatch({ type: 'AUDIT_FIX_STARTED', findingKey: key });

      if (fix.op === 'patch_json') {
        // Use existing Flow 2 push queue
        pushToCode(
          { operations: fix.patch, runAfter: [] },
          [finding.expectedToken || finding.layerName],
        );
        dispatch({ type: 'AUDIT_FIX_DONE' });
        dispatch({ type: 'REMOVE_FINDING', layerId: finding.layerId, divergenceType: finding.divergenceType });
      } else {
        // rebind or create_token — execute via plugin main thread
        pluginBridge
          .request<{ success: boolean; error: string | null }>(
            'EXECUTE_SUGGESTED_FIX',
            { layerId: finding.layerId, fix: fix },
            15000,
          )
          .then(function (result) {
            dispatch({ type: 'AUDIT_FIX_DONE' });
            if (result && result.success) {
              dispatch({ type: 'REMOVE_FINDING', layerId: finding.layerId, divergenceType: finding.divergenceType });
            } else {
              dispatch({ type: 'SET_AUDIT_ERROR', error: (result && result.error) || 'Fix failed' });
            }
          })
          .catch(function () {
            dispatch({ type: 'AUDIT_FIX_DONE' });
            dispatch({ type: 'SET_AUDIT_ERROR', error: 'Fix request failed' });
          });
      }
    },
    [pushToCode],
  );

  const executeFixAll = useCallback(
    function (divergenceType: DivergenceType) {
      const s = stateRef.current;
      const findings = s.auditFindings.filter(function (f) {
        return f.divergenceType === divergenceType && f.suggestedFix;
      });
      if (findings.length === 0) return;

      // Separate patch_json fixes from plugin API fixes
      const patchFindings: AuditFinding[] = [];
      const pluginApiFindings: AuditFinding[] = [];
      for (let i = 0; i < findings.length; i++) {
        if (findings[i].suggestedFix && findings[i].suggestedFix!.op === 'patch_json') {
          patchFindings.push(findings[i]);
        } else {
          pluginApiFindings.push(findings[i]);
        }
      }

      // Merge patch_json fixes into a single APPLY_PATCH
      if (patchFindings.length > 0) {
        const allOps: Array<{ op: string; path: string; value?: unknown }> = [];
        const names: string[] = [];
        for (let i = 0; i < patchFindings.length; i++) {
          const fix = patchFindings[i].suggestedFix!;
          if (fix.op === 'patch_json') {
            for (let j = 0; j < fix.patch.length; j++) {
              allOps.push(fix.patch[j]);
            }
            names.push(patchFindings[i].expectedToken || patchFindings[i].layerName);
          }
        }
        pushToCode({ operations: allOps, runAfter: [] }, names);
        for (let i = 0; i < patchFindings.length; i++) {
          dispatch({ type: 'REMOVE_FINDING', layerId: patchFindings[i].layerId, divergenceType: divergenceType });
        }
      }

      // Execute plugin API fixes serially
      if (pluginApiFindings.length > 0) {
        executeFixesSerially(pluginApiFindings, 0, divergenceType, dispatch);
      }
    },
    [pushToCode],
  );

  const runAudit = useCallback(function () {
    if (wsBridge.getStatus() !== 'connected') return;
    dispatch({ type: 'CLEAR_AUDIT' });
    wsBridge.sendMessage('RUN_AUDIT', {});
  }, []);

  const saveConfig = useCallback(
    (config: PluginConfig) => {
      dispatch({ type: 'SET_CONFIG', config });
      // Persist to pluginData
      pluginBridge.request('WRITE_PLUGIN_DATA', {
        key: 'config',
        value: JSON.stringify(config),
      }).catch(() => {});
      // Send to bridge if connected
      if (wsBridge.getStatus() === 'connected') {
        wsBridge.sendMessage('SAVE_CONFIG', {
          pipeline: config.pipeline,
          bridgePort: config.bridgePort,
        });
      }
    },
    [],
  );

  return (
    <PluginCtx.Provider value={{ state, dispatch, setActiveTab, saveConfig, refreshStyles, pushToCode, pickFolder, scanComponent, executeFix, executeFixAll, runAudit }}>
      {children}
    </PluginCtx.Provider>
  );
}
