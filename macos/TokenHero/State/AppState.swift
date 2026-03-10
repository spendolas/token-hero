import Foundation
import SwiftUI
import ServiceManagement

@Observable
@MainActor
final class AppState {
    var iconState: IconState = .idle
    var connectedPluginCount: Int = 0
    var lastRunLabel: String?
    var lastRunSuccess: Bool = true
    var isRunning: Bool = false
    var launchAtLogin: Bool = false
    var errorMessage: String?

    /// Config loaded from token-hero.config.json in projectRoot (if it exists)
    var currentConfig: TokenHeroConfig?

    /// Project root — received from the plugin via HELLO
    var projectRoot: String?

    /// WebSocket port
    var bridgePort: Int {
        didSet { UserDefaults.standard.set(bridgePort, forKey: "bridgePort") }
    }

    init() {
        self.bridgePort = UserDefaults.standard.object(forKey: "bridgePort") as? Int ?? 7799
        loadLoginItemState()
    }

    var stateLabel: String {
        iconState.label
    }

    func loadCurrentConfig() {
        guard let root = projectRoot else {
            currentConfig = nil
            return
        }
        currentConfig = TokenHeroConfig.load(from: root)
    }

    func updateIconState() {
        if isRunning {
            iconState = .running
        } else if errorMessage != nil {
            iconState = .error
        } else if connectedPluginCount > 0 {
            iconState = .connected
        } else {
            iconState = .idle
        }
    }

    func setRunning(command: String) {
        isRunning = true
        errorMessage = nil
        updateIconState()
    }

    func setRunComplete(command: String, success: Bool, durationMs: Int) {
        isRunning = false
        let durationSec = Double(durationMs) / 1000.0
        let shortName = command.components(separatedBy: " ").first ?? command
        let symbol = success ? "\u{2713}" : "\u{2717}"
        lastRunLabel = "\(shortName) \u{2014} \(symbol) \(String(format: "%.1f", durationSec))s ago"
        lastRunSuccess = success
        if !success {
            errorMessage = "Command failed: \(shortName)"
        } else {
            errorMessage = nil
        }
        updateIconState()
    }

    func setPluginCount(_ count: Int) {
        connectedPluginCount = count
        updateIconState()
    }

    private func loadLoginItemState() {
        if #available(macOS 13.0, *) {
            launchAtLogin = SMAppService.mainApp.status == .enabled
        }
    }

    func toggleLoginItem() {
        if #available(macOS 13.0, *) {
            do {
                if launchAtLogin {
                    try SMAppService.mainApp.unregister()
                } else {
                    try SMAppService.mainApp.register()
                }
                launchAtLogin.toggle()
            } catch {
                // Silent failure
            }
        }
    }
}
