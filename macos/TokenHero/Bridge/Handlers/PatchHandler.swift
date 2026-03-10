import Foundation
import WebSocketKit

enum PatchHandler {
    static func handle(
        ws: WebSocket,
        message: BridgeMessage,
        appState: AppState,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared

        guard let projectRoot = await MainActor.run(body: { appState.projectRoot }) else {
            await sendError(ws: ws, bridge: bridge, id: message.id, message: "No project folder configured")
            return
        }
        let config = await MainActor.run(body: { appState.currentConfig })

        guard let payload = message.payload.objectValue,
              let targetFile = payload["targetFile"]?.stringValue,
              let patchOps = payload["patch"]?.arrayValue else {
            await sendError(ws: ws, bridge: bridge, id: message.id, message: "Invalid APPLY_PATCH payload")
            return
        }

        let runAfter = payload["runAfter"]?.arrayValue?.compactMap(\.stringValue) ?? []

        // Validate target is not a generated/protected file
        if let config, isProtectedFile(targetFile, config: config) {
            let errorPayload: JSONValue = .object([
                "correlationId": .string(message.id),
                "code": .string("PATCH_TARGET_INVALID"),
                "message": .string("Cannot patch protected file: \(targetFile)"),
            ])
            let response = BridgeMessage(type: MessageType.error, payload: errorPayload)
            await bridge.send(to: ws, message: response)
            return
        }

        let fullPath = URL(fileURLWithPath: projectRoot).appendingPathComponent(targetFile)

        do {
            // Read current file
            let fileData = try Data(contentsOf: fullPath)
            var jsonObj = try JSONSerialization.jsonObject(with: fileData) as? [String: Any] ?? [:]

            // Apply RFC 6902 JSON Patch operations
            for op in patchOps {
                guard let opObj = op.objectValue,
                      let opType = opObj["op"]?.stringValue,
                      let path = opObj["path"]?.stringValue else { continue }

                let keys = parsePath(path)
                switch opType {
                case "replace", "add":
                    let value = opObj["value"]
                    setNestedValue(&jsonObj, keys: keys, value: jsonValueToAny(value))
                case "remove":
                    removeNestedValue(&jsonObj, keys: keys)
                default:
                    break
                }
            }

            // Atomic write
            let updatedData = try JSONSerialization.data(withJSONObject: jsonObj, options: [.prettyPrinted, .sortedKeys])
            try AtomicWriter.writeJSON(data: updatedData, to: fullPath)

            await logger.log(.info, "APPLY_PATCH \u{2014} \(targetFile)")

            // Run commands
            var commandResults: [JSONValue] = []
            for command in runAfter {
                await MainActor.run { appState.setRunning(command: command) }
                await logger.log(.run, command)

                do {
                    let result = try await ShellRunner.run(command: command, workingDirectory: projectRoot)
                    let durationMs = result.durationMs

                    commandResults.append(.object([
                        "command": .string(command),
                        "exitCode": .int(Int(result.exitCode)),
                        "stdout": .string(result.stdout),
                        "stderr": .string(result.stderr),
                        "durationMs": .int(durationMs),
                    ]))

                    let success = result.exitCode == 0
                    if success {
                        await logger.log(.ok, "\(command) \u{2014} exit 0 (\(String(format: "%.1f", Double(durationMs) / 1000))s)")
                    } else {
                        await logger.log(.error, "\(command) \u{2014} exit \(result.exitCode) (\(String(format: "%.1f", Double(durationMs) / 1000))s)")
                    }

                    await MainActor.run { appState.setRunComplete(command: command, success: success, durationMs: durationMs) }
                } catch {
                    commandResults.append(.object([
                        "command": .string(command),
                        "exitCode": .int(1),
                        "stderr": .string(error.localizedDescription),
                        "durationMs": .int(0),
                    ]))
                    await MainActor.run { appState.setRunComplete(command: command, success: false, durationMs: 0) }
                }
            }

            let patchedPaths = patchOps.compactMap { $0.objectValue?["path"]?.stringValue }
            let resultPayload: JSONValue = .object([
                "success": .bool(true),
                "projectRoot": .string(projectRoot),
                "projectName": .string(URL(fileURLWithPath: projectRoot).lastPathComponent),
                "patchedPaths": .array(patchedPaths.map { .string($0) }),
                "commandResults": .array(commandResults),
            ])

            let response = BridgeMessage(id: message.id, type: MessageType.patchResult, payload: resultPayload)
            await bridge.send(to: ws, message: response)

        } catch {
            await logger.log(.error, "Patch failed: \(error.localizedDescription)")
            await sendError(ws: ws, bridge: bridge, id: message.id, message: "Patch failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Helpers

    private static func isProtectedFile(_ path: String, config: TokenHeroConfig) -> Bool {
        // Check if it's the source file itself
        if path == config.pipeline.sourceFile { return true }

        // Check generated list
        if let generated = config.pipeline.generated, generated.contains(path) { return true }

        // Pipeline-type defaults
        switch config.pipeline.type {
        case "json-source":
            let defaults = ["src/generated/ds.ts", "src/index.css", "src/utils/port-colors.ts"]
            if defaults.contains(path) { return true }
        case "style-dictionary":
            if path.hasPrefix("build/") { return true }
        default:
            break
        }

        return false
    }

    private static func parsePath(_ path: String) -> [String] {
        // RFC 6902 path: "/a/b/c" → ["a", "b", "c"]
        var p = path
        if p.hasPrefix("/") { p = String(p.dropFirst()) }
        return p.components(separatedBy: "/")
            .map { $0.replacingOccurrences(of: "~1", with: "/").replacingOccurrences(of: "~0", with: "~") }
    }

    private static func setNestedValue(_ obj: inout [String: Any], keys: [String], value: Any?) {
        guard !keys.isEmpty else { return }
        if keys.count == 1 {
            obj[keys[0]] = value
            return
        }
        var nested = obj[keys[0]] as? [String: Any] ?? [:]
        setNestedValue(&nested, keys: Array(keys.dropFirst()), value: value)
        obj[keys[0]] = nested
    }

    private static func removeNestedValue(_ obj: inout [String: Any], keys: [String]) {
        guard !keys.isEmpty else { return }
        if keys.count == 1 {
            obj.removeValue(forKey: keys[0])
            return
        }
        if var nested = obj[keys[0]] as? [String: Any] {
            removeNestedValue(&nested, keys: Array(keys.dropFirst()))
            obj[keys[0]] = nested
        }
    }

    private static func jsonValueToAny(_ value: JSONValue?) -> Any? {
        guard let value else { return nil }
        switch value {
        case .null: return NSNull()
        case .bool(let b): return b
        case .int(let i): return i
        case .double(let d): return d
        case .string(let s): return s
        case .array(let arr): return arr.map { jsonValueToAny($0) as Any }
        case .object(let obj): return obj.mapValues { jsonValueToAny($0) as Any }
        }
    }

    private static func sendError(ws: WebSocket, bridge: WebSocketBridge, id: String, message: String) async {
        let payload: JSONValue = .object([
            "correlationId": .string(id),
            "code": .string("PATCH_FAILED"),
            "message": .string(message),
        ])
        let response = BridgeMessage(type: MessageType.error, payload: payload)
        await bridge.send(to: ws, message: response)
    }
}
