import Foundation
import WebSocketKit

enum AuditHandler {
    /// Full audit — runs auditCommand with no arguments.
    static func handleFullAudit(
        ws: WebSocket,
        message: BridgeMessage,
        appState: AppState,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared

        guard let projectRoot = await MainActor.run(body: { appState.projectRoot }),
              let config = await MainActor.run(body: { appState.currentConfig }) else {
            await sendError(ws: ws, bridge: bridge, id: message.id, message: "No project folder or config")
            return
        }

        guard let auditCommand = config.pipeline.auditCommand, !auditCommand.isEmpty else {
            await sendError(ws: ws, bridge: bridge, id: message.id, message: "No audit command configured")
            return
        }

        await MainActor.run { appState.setRunning(command: auditCommand) }
        await logger.log(.run, auditCommand)

        do {
            let result = try await ShellRunner.run(command: auditCommand, workingDirectory: projectRoot)

            let success = result.exitCode == 0
            if success {
                await logger.log(.ok, "audit \u{2014} exit 0 (\(String(format: "%.1f", Double(result.durationMs) / 1000))s)")
            } else {
                await logger.log(.error, "audit \u{2014} exit \(result.exitCode)")
            }
            await MainActor.run { appState.setRunComplete(command: auditCommand, success: success, durationMs: result.durationMs) }

            if success {
                if let findingsData = result.stdout.data(using: .utf8),
                   let findingsObj = try? JSONSerialization.jsonObject(with: findingsData) {
                    let findings = TokenSnapshotHandler_jsonToValue(findingsObj)

                    let auditPayload: JSONValue = .object([
                        "source": .string("binding"),
                        "generatedAt": .double(Date().timeIntervalSince1970 * 1000),
                        "replaceExisting": .bool(true),
                        "findings": findings,
                    ])

                    let response = BridgeMessage(type: MessageType.auditResults, payload: auditPayload)
                    await bridge.send(to: ws, message: response)
                    await logger.log(.info, "AUDIT_RESULTS sent to plugin")
                } else {
                    await sendError(ws: ws, bridge: bridge, id: message.id, message: "Failed to parse audit output as JSON")
                }
            } else {
                await sendError(ws: ws, bridge: bridge, id: message.id, message: "Audit command failed with exit code \(result.exitCode)")
            }
        } catch {
            await logger.log(.error, "Audit failed: \(error.localizedDescription)")
            await MainActor.run { appState.setRunComplete(command: auditCommand, success: false, durationMs: 0) }
            await sendError(ws: ws, bridge: bridge, id: message.id, message: error.localizedDescription)
        }
    }

    /// Scoped audit — runs auditCommand --component <jsonKey>.
    static func handle(
        ws: WebSocket,
        message: BridgeMessage,
        appState: AppState,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared

        guard let projectRoot = await MainActor.run(body: { appState.projectRoot }),
              let config = await MainActor.run(body: { appState.currentConfig }) else {
            await sendError(ws: ws, bridge: bridge, id: message.id, message: "No project folder or config")
            return
        }

        guard let auditCommand = config.pipeline.auditCommand, !auditCommand.isEmpty else {
            await sendError(ws: ws, bridge: bridge, id: message.id, message: "No audit command configured")
            return
        }

        let jsonKey = message.payload["jsonKey"]?.stringValue ?? ""
        let command = "\(auditCommand) --component \(jsonKey)"

        await MainActor.run { appState.setRunning(command: auditCommand) }
        await logger.log(.run, command)

        do {
            let result = try await ShellRunner.run(command: command, workingDirectory: projectRoot)

            let success = result.exitCode == 0
            if success {
                await logger.log(.ok, "audit \u{2014} exit 0 (\(String(format: "%.1f", Double(result.durationMs) / 1000))s)")
            } else {
                await logger.log(.error, "audit \u{2014} exit \(result.exitCode)")
            }
            await MainActor.run { appState.setRunComplete(command: auditCommand, success: success, durationMs: result.durationMs) }

            if success {
                // Parse stdout as findings JSON
                if let findingsData = result.stdout.data(using: .utf8),
                   let findingsObj = try? JSONSerialization.jsonObject(with: findingsData) {
                    let findings = TokenSnapshotHandler_jsonToValue(findingsObj)

                    let auditPayload: JSONValue = .object([
                        "source": .string("visual"),
                        "generatedAt": .double(Date().timeIntervalSince1970 * 1000),
                        "replaceExisting": .bool(true),
                        "findings": findings,
                    ])

                    let response = BridgeMessage(type: MessageType.auditResults, payload: auditPayload)
                    await bridge.send(to: ws, message: response)
                    await logger.log(.info, "AUDIT_RESULTS sent to plugin")
                } else {
                    await sendError(ws: ws, bridge: bridge, id: message.id, message: "Failed to parse audit output as JSON")
                }
            } else {
                await sendError(ws: ws, bridge: bridge, id: message.id, message: "Audit command failed with exit code \(result.exitCode)")
            }
        } catch {
            await logger.log(.error, "Audit failed: \(error.localizedDescription)")
            await MainActor.run { appState.setRunComplete(command: auditCommand, success: false, durationMs: 0) }
            await sendError(ws: ws, bridge: bridge, id: message.id, message: error.localizedDescription)
        }
    }

    private static func sendError(ws: WebSocket, bridge: WebSocketBridge, id: String, message: String) async {
        let payload: JSONValue = .object([
            "correlationId": .string(id),
            "code": .string("AUDIT_FAILED"),
            "message": .string(message),
        ])
        let response = BridgeMessage(type: MessageType.error, payload: payload)
        await bridge.send(to: ws, message: response)
    }
}

// Shared helper — converts Any (from JSONSerialization) to JSONValue
func TokenSnapshotHandler_jsonToValue(_ obj: Any) -> JSONValue {
    if obj is NSNull { return .null }
    if let b = obj as? Bool { return .bool(b) }
    if let i = obj as? Int { return .int(i) }
    if let d = obj as? Double { return .double(d) }
    if let s = obj as? String { return .string(s) }
    if let arr = obj as? [Any] { return .array(arr.map { TokenSnapshotHandler_jsonToValue($0) }) }
    if let dict = obj as? [String: Any] {
        var result: [String: JSONValue] = [:]
        for (k, v) in dict { result[k] = TokenSnapshotHandler_jsonToValue(v) }
        return .object(result)
    }
    return .null
}
