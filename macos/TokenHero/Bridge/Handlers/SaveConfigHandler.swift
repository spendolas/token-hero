import Foundation
import WebSocketKit

enum SaveConfigHandler {
    static func handle(
        ws: WebSocket,
        message: BridgeMessage,
        appState: AppState,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared

        guard let projectRoot = await MainActor.run(body: { appState.projectRoot }) else {
            await sendError(ws: ws, bridge: bridge, messageId: message.id, message: "No project folder configured")
            return
        }

        guard let payload = message.payload.objectValue else {
            await sendError(ws: ws, bridge: bridge, messageId: message.id, message: "Invalid payload")
            return
        }

        // Extract pipeline config from payload
        let pipeline = payload["pipeline"]?.objectValue
        let config = TokenHeroConfig(
            pipeline: PipelineSettings(
                type: pipeline?["type"]?.stringValue ?? "json-source",
                sourceFile: pipeline?["sourceFile"]?.stringValue ?? "",
                generateCommand: pipeline?["generateCommand"]?.stringValue ?? "",
                auditCommand: pipeline?["auditCommand"]?.stringValue,
                contactSheetUrl: pipeline?["contactSheetUrl"]?.stringValue,
                generated: pipeline?["generated"]?.arrayValue?.compactMap(\.stringValue),
                groupMap: pipeline?["groupMap"]?.objectValue?.compactMapValues(\.stringValue)
            ),
            bridgePort: payload["bridgePort"]?.intValue
        )

        do {
            try config.save(to: projectRoot)
            await MainActor.run { appState.currentConfig = config }
            await logger.log(.info, "Config saved")

            let resultPayload: JSONValue = .object(["success": .bool(true)])
            let response = BridgeMessage(id: message.id, type: MessageType.saveConfigResult, payload: resultPayload)
            await bridge.send(to: ws, message: response)
        } catch {
            await logger.log(.error, "Failed to save config: \(error.localizedDescription)")
            let resultPayload: JSONValue = .object(["success": .bool(false)])
            let response = BridgeMessage(id: message.id, type: MessageType.saveConfigResult, payload: resultPayload)
            await bridge.send(to: ws, message: response)
        }
    }

    private static func sendError(ws: WebSocket, bridge: WebSocketBridge, messageId: String, message: String) async {
        let payload: JSONValue = .object([
            "correlationId": .string(messageId),
            "code": .string("UNKNOWN"),
            "message": .string(message),
        ])
        let response = BridgeMessage(type: MessageType.error, payload: payload)
        await bridge.send(to: ws, message: response)
    }
}

// Helper extension
extension Dictionary where Value == JSONValue {
    func compactMapValues<T>(_ transform: (JSONValue) -> T?) -> [Key: T] {
        var result: [Key: T] = [:]
        for (key, value) in self {
            if let transformed = transform(value) {
                result[key] = transformed
            }
        }
        return result
    }
}
