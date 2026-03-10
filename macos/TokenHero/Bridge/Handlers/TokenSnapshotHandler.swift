import Foundation
import WebSocketKit

enum TokenSnapshotHandler {
    static func handle(
        ws: WebSocket,
        message: BridgeMessage,
        appState: AppState,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared

        guard let projectRoot = await MainActor.run(body: { appState.projectRoot }),
              let config = await MainActor.run(body: { appState.currentConfig }) else {
            await sendError(ws: ws, bridge: bridge, id: message.id, code: "UNKNOWN", message: "No project folder or config")
            return
        }

        let sourceFile = config.pipeline.sourceFile
        guard !sourceFile.isEmpty else {
            await sendError(ws: ws, bridge: bridge, id: message.id, code: "SOURCE_FILE_NOT_FOUND", message: "No source file configured")
            return
        }

        let fullPath = URL(fileURLWithPath: projectRoot)
            .appendingPathComponent(sourceFile)

        guard FileManager.default.fileExists(atPath: fullPath.path) else {
            await sendError(ws: ws, bridge: bridge, id: message.id, code: "SOURCE_FILE_NOT_FOUND", message: "Source file not found: \(sourceFile)")
            return
        }

        do {
            let data = try Data(contentsOf: fullPath)
            let jsonObject = try JSONSerialization.jsonObject(with: data)

            // Convert the raw JSON to our JSONValue format
            let tokens = jsonToValue(jsonObject)
            let readAt = Date().timeIntervalSince1970 * 1000

            // Apply groupMap if configured
            let finalTokens: JSONValue
            if let groupMap = config.pipeline.groupMap, !groupMap.isEmpty {
                finalTokens = applyGroupMap(tokens: tokens, groupMap: groupMap)
            } else {
                finalTokens = tokens
            }

            let resultPayload: JSONValue = .object([
                "sourceFile": .string(sourceFile),
                "readAt": .double(readAt),
                "tokens": finalTokens,
            ])

            let response = BridgeMessage(id: message.id, type: MessageType.tokenSnapshotResult, payload: resultPayload)
            await bridge.send(to: ws, message: response)
            await logger.log(.info, "Token snapshot sent for \(sourceFile)")

        } catch {
            await logger.log(.error, "Failed to parse source file: \(error.localizedDescription)")
            await sendError(
                ws: ws, bridge: bridge, id: message.id,
                code: "SOURCE_FILE_PARSE_ERROR",
                message: "Failed to parse source file",
                detail: .object(["line": .null, "message": .string(error.localizedDescription)])
            )
        }
    }

    private static func applyGroupMap(tokens: JSONValue, groupMap: [String: String]) -> JSONValue {
        // groupMap maps Figma collection names to token group names.
        // For now, pass through the tokens as-is — the groupMap transform
        // will be refined once we have real source file formats to test against.
        return tokens
    }

    private static func jsonToValue(_ obj: Any) -> JSONValue {
        if obj is NSNull { return .null }
        if let b = obj as? Bool { return .bool(b) }
        if let i = obj as? Int { return .int(i) }
        if let d = obj as? Double { return .double(d) }
        if let s = obj as? String { return .string(s) }
        if let arr = obj as? [Any] { return .array(arr.map { jsonToValue($0) }) }
        if let dict = obj as? [String: Any] {
            var result: [String: JSONValue] = [:]
            for (k, v) in dict { result[k] = jsonToValue(v) }
            return .object(result)
        }
        return .null
    }

    private static func sendError(
        ws: WebSocket,
        bridge: WebSocketBridge,
        id: String,
        code: String,
        message: String,
        detail: JSONValue? = nil
    ) async {
        var obj: [String: JSONValue] = [
            "correlationId": .string(id),
            "code": .string(code),
            "message": .string(message),
        ]
        if let detail { obj["detail"] = detail }
        let response = BridgeMessage(type: MessageType.error, payload: .object(obj))
        await bridge.send(to: ws, message: response)
    }
}
