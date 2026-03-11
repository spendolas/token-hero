import Foundation
import WebSocketKit

/// Correlation proxy for GET_COMPONENT_PROPERTIES.
/// Stores the requesting WebSocket, forwards to the plugin, routes the result back.
@MainActor
enum ComponentPropertiesHandler {
    private struct PendingRequest {
        let ws: WebSocket
        let timeoutTask: Task<Void, Never>
    }

    private static var pending: [String: PendingRequest] = [:]

    /// Handle GET_COMPONENT_PROPERTIES from an audit script (or other external client).
    /// Forwards the request to the plugin via broadcast and starts a timeout.
    static func handle(
        ws: WebSocket,
        message: BridgeMessage,
        appState: AppState,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared
        let requestId = message.id

        // Extract optional per-request timeout (default 10s)
        let timeoutMs = message.payload["timeoutMs"]?.intValue ?? 10000
        let timeoutSeconds = max(1, timeoutMs / 1000)

        await logger.log(.info, "GET_COMPONENT_PROPERTIES request: \(requestId)")

        // Store pending request
        let timeout = Task {
            try? await Task.sleep(nanoseconds: UInt64(timeoutSeconds) * 1_000_000_000)
            guard !Task.isCancelled else { return }
            await handleTimeout(requestId: requestId, bridge: bridge)
        }
        pending[requestId] = PendingRequest(ws: ws, timeoutTask: timeout)

        // Forward to plugin (broadcast — the plugin UI will relay to main thread)
        let forwardMessage = BridgeMessage(
            id: requestId,
            type: MessageType.getComponentProperties,
            payload: message.payload
        )
        await bridge.broadcast(message: forwardMessage)
    }

    /// Handle COMPONENT_PROPERTIES_RESULT from the plugin.
    /// Routes the response back to the original requesting WebSocket.
    static func handleResult(
        ws: WebSocket,
        message: BridgeMessage,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared
        let requestId = message.id

        guard let pendingReq = pending.removeValue(forKey: requestId) else {
            await logger.log(.warn, "COMPONENT_PROPERTIES_RESULT with no pending request: \(requestId)")
            return
        }

        // Cancel timeout
        pendingReq.timeoutTask.cancel()

        // Forward result to the original requester
        let response = BridgeMessage(
            id: requestId,
            type: MessageType.componentPropertiesResult,
            payload: message.payload
        )
        await bridge.send(to: pendingReq.ws, message: response)
        await logger.log(.info, "COMPONENT_PROPERTIES_RESULT forwarded for: \(requestId)")
    }

    private static func handleTimeout(requestId: String, bridge: WebSocketBridge) async {
        guard let pendingReq = pending.removeValue(forKey: requestId) else { return }

        let logger = TokenHeroLogger.shared
        await logger.log(.warn, "GET_COMPONENT_PROPERTIES timed out: \(requestId)")

        let errorPayload: JSONValue = .object([
            "correlationId": .string(requestId),
            "code": .string("BRIDGE_TIMEOUT"),
            "message": .string("Component properties request timed out"),
        ])
        let response = BridgeMessage(type: MessageType.error, payload: errorPayload)
        await bridge.send(to: pendingReq.ws, message: response)
    }
}
