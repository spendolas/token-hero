import AppKit
import Foundation
import WebSocketKit

enum PickFolderHandler {
    static func handle(
        ws: WebSocket,
        message: BridgeMessage,
        appState: AppState,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared

        // NSOpenPanel must run on the main thread
        let path: String? = await MainActor.run {
            let panel = NSOpenPanel()
            panel.canChooseFiles = false
            panel.canChooseDirectories = true
            panel.allowsMultipleSelection = false
            panel.prompt = "Choose"
            panel.message = "Select the project root folder"

            if let root = appState.projectRoot {
                panel.directoryURL = URL(fileURLWithPath: root)
            }

            let previousPolicy = NSApp.activationPolicy()
            NSApp.setActivationPolicy(.regular)
            NSApp.activate(ignoringOtherApps: true)
            let result = panel.runModal()
            NSApp.setActivationPolicy(previousPolicy)
            return result == .OK ? panel.url?.path : nil
        }

        if let path {
            await MainActor.run {
                appState.projectRoot = path
                appState.loadCurrentConfig()
            }
            await logger.setProjectRoot(path)
            await logger.log(.info, "Project root set to: \(path)")

            // Send a fresh HELLO_ACK with the real project state
            let config = await MainActor.run(body: { appState.currentConfig })
            let sourceFile = config?.pipeline.sourceFile ?? ""
            let projectName = URL(fileURLWithPath: path).lastPathComponent

            var configWrittenAt: Double = 0
            var unresolvedPaths: [JSONValue] = []

            let configPath = URL(fileURLWithPath: path)
                .appendingPathComponent("token-hero.config.json")
            if let attrs = try? FileManager.default.attributesOfItem(atPath: configPath.path),
               let mtime = attrs[.modificationDate] as? Date {
                configWrittenAt = mtime.timeIntervalSince1970 * 1000
            }

            if !sourceFile.isEmpty {
                let fullPath = URL(fileURLWithPath: path)
                    .appendingPathComponent(sourceFile)
                if !FileManager.default.fileExists(atPath: fullPath.path) {
                    unresolvedPaths.append(.string(sourceFile))
                }
            }

            let ackPayload: JSONValue = .object([
                "appVersion": .string(APP_VERSION),
                "projectName": .string(projectName),
                "projectRoot": .string(path),
                "sourceFile": .string(sourceFile),
                "componentMapCount": .int(0),
                "configWrittenAt": .double(configWrittenAt),
                "unresolvedPaths": .array(unresolvedPaths),
            ])
            // Send PICK_FOLDER_RESULT first (plugin persists to pluginData)
            let pickPayload: JSONValue = .object(["path": .string(path)])
            let pickResponse = BridgeMessage(id: message.id, type: MessageType.pickFolderResult, payload: pickPayload)
            await bridge.send(to: ws, message: pickResponse)

            // Then send HELLO_ACK with full project state
            let ack = BridgeMessage(type: MessageType.helloAck, payload: ackPayload)
            await bridge.send(to: ws, message: ack)
        } else {
            // Cancelled — send null path
            let payload: JSONValue = .object(["path": .null])
            let response = BridgeMessage(
                id: message.id,
                type: MessageType.pickFolderResult,
                payload: payload
            )
            await bridge.send(to: ws, message: response)
        }
    }
}
