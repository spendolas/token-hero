/**
 * WebSocket Bridge — connects to the macOS Token Hero bridge app.
 *
 * Handles connection lifecycle, HELLO handshake, reconnect with
 * backoff, and message dispatch.
 */

import type { BridgeMessage, HelloPayload, MessageType } from '@shared/protocol';
import { PROTOCOL_VERSION } from '@shared/protocol';

// ── Types ────────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'version_mismatch';

type MessageCallback = (type: MessageType, payload: unknown) => void;
type StatusCallback = (status: ConnectionStatus) => void;

// ── State ────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let currentPort = 0;
let helloPayload: HelloPayload | null = null;
let status: ConnectionStatus = 'disconnected';
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let unloadHandler: (() => void) | null = null;

const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];

const messageListeners = new Set<MessageCallback>();
const statusListeners = new Set<StatusCallback>();

// ── Helpers ──────────────────────────────────────────────────

let nextMsgId = 0;

function generateMsgId(): string {
  return `msg_${++nextMsgId}_${Date.now()}`;
}

function setStatus(next: ConnectionStatus) {
  if (status === next) return;
  status = next;
  for (const cb of statusListeners) cb(next);
}

function clearRetryTimer() {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function removeUnloadHandler() {
  if (unloadHandler) {
    window.removeEventListener('beforeunload', unloadHandler);
    unloadHandler = null;
  }
}

// ── Public API ───────────────────────────────────────────────

/** Connect to the bridge WebSocket server. */
export function connect(port: number, hello: HelloPayload) {
  currentPort = port;
  helloPayload = hello;
  retryCount = 0;
  openSocket();
}

/** Gracefully disconnect. */
export function disconnect() {
  clearRetryTimer();
  removeUnloadHandler();
  setStatus('disconnected');
  if (ws) {
    ws.close(1000, 'plugin_disconnect');
    ws = null;
  }
}

/** Send a typed message through the WebSocket. */
export function sendMessage(type: MessageType, payload: unknown = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const envelope: BridgeMessage = {
    id: generateMsgId(),
    protocolVersion: PROTOCOL_VERSION,
    type,
    payload,
    timestamp: Date.now(),
  };
  ws.send(JSON.stringify(envelope));
}

/** Subscribe to incoming bridge messages. */
export function onMessage(cb: MessageCallback): () => void {
  messageListeners.add(cb);
  return () => { messageListeners.delete(cb); };
}

/** Subscribe to connection status changes. */
export function onStatus(cb: StatusCallback): () => void {
  statusListeners.add(cb);
  return () => { statusListeners.delete(cb); };
}

/** Get current status synchronously. */
export function getStatus(): ConnectionStatus {
  return status;
}

// ── Socket lifecycle ─────────────────────────────────────────

function openSocket() {
  removeUnloadHandler();
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
    ws = null;
  }

  setStatus(retryCount === 0 ? 'connecting' : 'reconnecting');

  try {
    ws = new WebSocket(`ws://localhost:${currentPort}`);
  } catch {
    scheduleRetry();
    return;
  }

  ws.onopen = () => {
    retryCount = 0;
    // Send HELLO immediately
    if (helloPayload) {
      sendMessage('HELLO', helloPayload);
    }
  };

  ws.onmessage = (event) => {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      console.warn('[wsBridge] failed to parse message', event.data);
      return;
    }
    // Handle protocol-level messages
    switch (msg.type) {
      case 'HELLO_ACK':
        setStatus('connected');
        break;
      case 'VERSION_MISMATCH':
        setStatus('version_mismatch');
        disconnect();
        // Still dispatch so UI can show banner
        break;
      case 'BRIDGE_CLOSING': {
        const reason = (msg.payload as { reason?: string })?.reason;
        if (reason === 'project_switch') {
          // Will reconnect on close
          retryCount = 0;
        }
        break;
      }
    }

    // Dispatch to all listeners
    for (const cb of messageListeners) cb(msg.type, msg.payload);
  };

  ws.onclose = () => {
    ws = null;
    if (status !== 'disconnected' && status !== 'version_mismatch') {
      scheduleRetry();
    }
  };

  ws.onerror = () => {};

  // Backup: close WebSocket if iframe is destroyed
  unloadHandler = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'plugin_closing');
    }
  };
  window.addEventListener('beforeunload', unloadHandler);
}

function scheduleRetry() {
  const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
  retryCount++;
  setStatus(retryCount <= 3 ? 'reconnecting' : 'offline');
  clearRetryTimer();
  retryTimer = setTimeout(openSocket, delay);
}
