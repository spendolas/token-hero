import Foundation
import WebSocketKit

enum HelloHandler {
    static func handle(
        ws: WebSocket,
        message: BridgeMessage,
        appState: AppState,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared

        // Validate protocol version
        if message.protocolVersion != PROTOCOL_VERSION {
            let payload: JSONValue = .object([
                "bridgeVersion": .int(PROTOCOL_VERSION),
                "pluginVersion": .int(message.protocolVersion),
            ])
            let response = BridgeMessage(type: MessageType.versionMismatch, payload: payload)
            await bridge.send(to: ws, message: response)
            try? await ws.close()
            await logger.log(.warn, "Version mismatch: plugin=\(message.protocolVersion), bridge=\(PROTOCOL_VERSION)")
            return
        }

        // Extract HELLO payload
        let figmaFileKey = message.payload["figmaFileKey"]?.stringValue ?? ""
        let figmaFileName = message.payload["figmaFileName"]?.stringValue ?? ""
        let pluginVersion = message.payload["pluginVersion"]?.stringValue ?? "unknown"
        let pluginProjectRoot = message.payload["projectRoot"]?.stringValue

        await logger.log(.info, "Plugin connected \u{2014} \"\(figmaFileName)\" (pluginVersion: \(pluginVersion))")

        // Use project root from plugin if provided
        if let root = pluginProjectRoot, !root.isEmpty {
            await MainActor.run {
                appState.projectRoot = root
                appState.loadCurrentConfig()
            }
        }

        // Build HELLO_ACK
        let projectRoot = await MainActor.run(body: { appState.projectRoot })
        let config = await MainActor.run(body: { appState.currentConfig })
        let sourceFile = config?.pipeline.sourceFile ?? ""
        let projectName = projectRoot.map { URL(fileURLWithPath: $0).lastPathComponent } ?? ""

        var configWrittenAt: Double = 0
        var unresolvedPaths: [JSONValue] = []

        if let root = projectRoot {
            let configPath = URL(fileURLWithPath: root)
                .appendingPathComponent("token-hero.config.json")
            if let attrs = try? FileManager.default.attributesOfItem(atPath: configPath.path),
               let mtime = attrs[.modificationDate] as? Date {
                configWrittenAt = mtime.timeIntervalSince1970 * 1000
            }

            if !sourceFile.isEmpty {
                let fullPath = URL(fileURLWithPath: root)
                    .appendingPathComponent(sourceFile)
                if !FileManager.default.fileExists(atPath: fullPath.path) {
                    unresolvedPaths.append(.string(sourceFile))
                }
            }
        }

        let ackPayload: JSONValue = .object([
            "appVersion": .string(APP_VERSION),
            "projectName": .string(projectName),
            "projectRoot": .string(projectRoot ?? ""),
            "sourceFile": .string(sourceFile),
            "componentMapCount": .int(0),
            "configWrittenAt": .double(configWrittenAt),
            "unresolvedPaths": .array(unresolvedPaths),
        ])

        let response = BridgeMessage(id: message.id, type: MessageType.helloAck, payload: ackPayload)
        await bridge.send(to: ws, message: response)
    }
}
