/**
 * Plugin Bridge — async wrapper over Figma postMessage.
 *
 * Turns the fire-and-forget postMessage into request/response with
 * requestId correlation, and provides pub/sub for push messages.
 */

type Callback = (payload: unknown) => void;

let nextId = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const subscribers = new Map<string, Set<Callback>>();

function generateId(): string {
  return `req_${++nextId}_${Date.now()}`;
}

/** Initialize the bridge — call once at app startup. */
export function init() {
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (!msg || !msg.type) return;

    // Resolve pending request if there's a matching requestId
    if (msg.requestId && pending.has(msg.requestId)) {
      const { resolve } = pending.get(msg.requestId)!;
      pending.delete(msg.requestId);
      resolve(msg.payload);
      return;
    }

    // Notify subscribers for push messages
    const subs = subscribers.get(msg.type);
    if (subs) {
      for (const cb of subs) cb(msg.payload);
    }
  });
}

/** Send a request and wait for the correlated response. */
export function request<T = unknown>(
  type: string,
  payload: Record<string, unknown> = {},
  timeout = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const requestId = generateId();
    pending.set(requestId, {
      resolve: resolve as (v: unknown) => void,
      reject,
    });

    parent.postMessage(
      { pluginMessage: { type, requestId, ...payload } },
      '*',
    );

    setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        reject(new Error(`pluginBridge: ${type} timed out after ${timeout}ms`));
      }
    }, timeout);
  });
}

/** Fire-and-forget message to the main thread. */
export function send(type: string, payload: Record<string, unknown> = {}) {
  parent.postMessage({ pluginMessage: { type, ...payload } }, '*');
}

/** Subscribe to push messages from the main thread. Returns an unsubscribe function. */
export function on(type: string, callback: Callback): () => void {
  if (!subscribers.has(type)) {
    subscribers.set(type, new Set());
  }
  subscribers.get(type)!.add(callback);
  return () => {
    subscribers.get(type)?.delete(callback);
  };
}
