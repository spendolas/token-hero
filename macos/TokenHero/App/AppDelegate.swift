import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    var appState: AppState?
    private var bridge: WebSocketBridge?
    private var messageRouter: MessageRouter?
    private var settingsWindow: NSWindow?
    private var logWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Deep link handling is done via onOpenURL in SwiftUI
    }

    func startBridge() {
        guard let appState else { return }

        let bridge = WebSocketBridge(
            onConnect: { [weak self] count in
                Task { @MainActor in
                    self?.appState?.setPluginCount(count)
                }
            },
            onDisconnect: { [weak self] count in
                Task { @MainActor in
                    self?.appState?.setPluginCount(count)
                }
            },
            onMessage: { [weak self] ws, text in
                Task { @MainActor in
                    self?.messageRouter?.handleMessage(ws: ws, text: text)
                }
            }
        )
        self.bridge = bridge
        self.messageRouter = MessageRouter(appState: appState, bridge: bridge)

        // Set logger project root
        if let root = appState.projectRoot {
            Task {
                await TokenHeroLogger.shared.setProjectRoot(root)
            }
        }

        let port = appState.bridgePort
        Task {
            do {
                try await bridge.start(port: port)
                await TokenHeroLogger.shared.log(.info, "WebSocket server listening on port \(port)")
            } catch {
                await MainActor.run {
                    appState.errorMessage = "Port \(port) is in use \u{2014} change the port in Settings or quit the conflicting process."
                    appState.updateIconState()
                }
                await TokenHeroLogger.shared.log(.error, "Failed to start WebSocket server: \(error.localizedDescription)")
            }
        }
    }

    func stopBridge() async {
        await bridge?.stop()
        bridge = nil
        messageRouter = nil
    }

    func restartBridge() {
        Task {
            await stopBridge()
            startBridge()
        }
    }

    // MARK: - Window management

    func showSettings() {
        if let window = settingsWindow {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        guard let appState else { return }

        let view = SettingsWindow(appState: appState, appDelegate: self)
        let hostingController = NSHostingController(rootView: view)

        let window = NSWindow(contentViewController: hostingController)
        window.title = "Token Hero Settings"
        window.styleMask = [.titled, .closable]
        window.setContentSize(NSSize(width: 380, height: 100))
        window.center()
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        self.settingsWindow = window
    }

    func showLog() {
        if let window = logWindow {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let view = LogWindow()
        let hostingController = NSHostingController(rootView: view)

        let window = NSWindow(contentViewController: hostingController)
        window.title = "Token Hero Log"
        window.styleMask = [.titled, .closable]
        window.setContentSize(NSSize(width: 600, height: 400))
        window.center()
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        self.logWindow = window
    }

    func handleDeepLink(_ url: URL) {
        guard url.scheme == "tokenhero" else { return }

        switch url.host {
        case "connect":
            if bridge == nil {
                startBridge()
            }

        case "settings":
            showSettings()

        default:
            break
        }
    }

    // MARK: - Run commands

    func runTokens() {
        guard let appState,
              let config = appState.currentConfig,
              let root = appState.projectRoot else { return }

        let command = config.pipeline.generateCommand
        guard !command.isEmpty else { return }

        Task {
            await MainActor.run { appState.setRunning(command: command) }
            await TokenHeroLogger.shared.log(.run, command)

            do {
                let result = try await ShellRunner.run(command: command, workingDirectory: root)
                let success = result.exitCode == 0

                if success {
                    await TokenHeroLogger.shared.log(.ok, "\(command) \u{2014} exit 0 (\(String(format: "%.1f", Double(result.durationMs) / 1000))s)")
                } else {
                    await TokenHeroLogger.shared.log(.error, "\(command) \u{2014} exit \(result.exitCode) (\(String(format: "%.1f", Double(result.durationMs) / 1000))s)")
                }

                await MainActor.run { appState.setRunComplete(command: command, success: success, durationMs: result.durationMs) }
            } catch {
                await TokenHeroLogger.shared.log(.error, "\(command) failed: \(error.localizedDescription)")
                await MainActor.run { appState.setRunComplete(command: command, success: false, durationMs: 0) }
            }
        }
    }

    func runAudit() {
        guard let appState,
              let config = appState.currentConfig,
              let auditCommand = config.pipeline.auditCommand,
              !auditCommand.isEmpty,
              let root = appState.projectRoot else { return }

        Task {
            await MainActor.run { appState.setRunning(command: auditCommand) }
            await TokenHeroLogger.shared.log(.run, auditCommand)

            do {
                let result = try await ShellRunner.run(command: auditCommand, workingDirectory: root)
                let success = result.exitCode == 0

                if success {
                    await TokenHeroLogger.shared.log(.ok, "audit \u{2014} exit 0 (\(String(format: "%.1f", Double(result.durationMs) / 1000))s)")

                    if let findingsData = result.stdout.data(using: .utf8),
                       let findingsObj = try? JSONSerialization.jsonObject(with: findingsData) {
                        let findings = TokenSnapshotHandler_jsonToValue(findingsObj)
                        let auditPayload: JSONValue = .object([
                            "source": .string("visual"),
                            "generatedAt": .double(Date().timeIntervalSince1970 * 1000),
                            "replaceExisting": .bool(false),
                            "findings": findings,
                        ])
                        let response = BridgeMessage(type: MessageType.auditResults, payload: auditPayload)
                        await bridge?.broadcast(message: response)
                        await TokenHeroLogger.shared.log(.info, "AUDIT_RESULTS sent to plugin")
                    }
                } else {
                    await TokenHeroLogger.shared.log(.error, "audit \u{2014} exit \(result.exitCode)")
                }

                await MainActor.run { appState.setRunComplete(command: auditCommand, success: success, durationMs: result.durationMs) }
            } catch {
                await TokenHeroLogger.shared.log(.error, "Audit failed: \(error.localizedDescription)")
                await MainActor.run { appState.setRunComplete(command: auditCommand, success: false, durationMs: 0) }
            }
        }
    }
}

extension AppDelegate: NSWindowDelegate {
    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        if window === settingsWindow {
            settingsWindow = nil
        } else if window === logWindow {
            logWindow = nil
        }
    }
}
