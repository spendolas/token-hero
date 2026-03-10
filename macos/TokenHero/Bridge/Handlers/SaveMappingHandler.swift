import Foundation
import WebSocketKit

enum SaveMappingHandler {
    static func handle(
        ws: WebSocket,
        message: BridgeMessage,
        appState: AppState,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared

        let projectRoot = await MainActor.run(body: { appState.projectRoot }) ?? ""

        let figmaNodeId = message.payload["figmaNodeId"]?.stringValue ?? ""
        let jsonKey = message.payload["jsonKey"]?.stringValue ?? ""

        await logger.log(.info, "SAVE_MAPPING: \(figmaNodeId) \u{2192} \(jsonKey)")

        let resultPayload: JSONValue = .object([
            "success": .bool(true),
            "projectRoot": .string(projectRoot),
            "projectName": .string(URL(fileURLWithPath: projectRoot).lastPathComponent),
            "patchedPaths": .array([]),
            "commandResults": .array([]),
        ])
        let response = BridgeMessage(id: message.id, type: MessageType.patchResult, payload: resultPayload)
        await bridge.send(to: ws, message: response)
    }
}
