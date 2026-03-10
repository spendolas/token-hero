/**
 * StatusPill — shows connection state and project name.
 */

import { usePlugin } from '../state/PluginContext';

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'offline',
  connecting: 'connecting\u2026',
  reconnecting: 'reconnecting\u2026',
  connected: 'connected',
  offline: 'offline',
  version_mismatch: 'version mismatch',
};

export function StatusPill() {
  const { state } = usePlugin();
  const isConnected = state.connectionStatus === 'connected';
  const label = STATUS_LABELS[state.connectionStatus] ?? 'offline';

  return (
    <div className={`status-pill ${isConnected ? 'status-connected' : ''}`}>
      <span className={`status-dot ${isConnected ? 'dot-connected' : ''}`} />
      <span className="status-label">
        {isConnected && state.projectName
          ? `${label} \u00B7 ${state.projectName}`
          : label}
      </span>
    </div>
  );
}
