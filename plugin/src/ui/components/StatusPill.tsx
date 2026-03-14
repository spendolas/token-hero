/**
 * StatusPill — shows connection state, project name, and refresh indicator.
 */

import { usePlugin } from '../state/PluginContext';
import { timeAgo } from '../logic/timeAgo';

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'offline',
  connecting: 'connecting\u2026',
  reconnecting: 'reconnecting\u2026',
  connected: 'connected',
  offline: 'offline',
  version_mismatch: 'version mismatch',
};

export function StatusPill() {
  const { state, refreshStyles } = usePlugin();
  const isConnected = state.connectionStatus === 'connected';
  const label = STATUS_LABELS[state.connectionStatus] ?? 'offline';

  const showRefresh = state.activeTab === 'styles' && state.codeSnapshot !== null && state.codeSnapshotFetchedAt !== null;
  const refreshLabel = showRefresh ? `\u21BB ${timeAgo(state.codeSnapshotFetchedAt!)}` : null;

  return (
    <div className={`status-pill ${isConnected ? 'status-connected' : ''}`}>
      <span className={`status-dot ${isConnected ? 'dot-connected' : ''}`} />
      <span className="status-label">
        {isConnected && state.projectName
          ? `${label} \u00B7 ${state.projectName}`
          : label}
      </span>
      {refreshLabel && (
        <button className="refresh-indicator" onClick={() => refreshStyles(true)}>
          {refreshLabel}
        </button>
      )}
    </div>
  );
}
