import SwiftUI
import AppKit

struct MenuBarView: View {
    @Bindable var appState: AppState
    let appDelegate: AppDelegate

    var body: some View {
        HStack {
            Circle()
                .fill(appState.iconState.tintColor)
                .frame(width: 6, height: 6)
            Text("Token Hero")
            Spacer()
            Text(appState.stateLabel)
                .foregroundStyle(.secondary)
        }

        Divider()

        if let lastRun = appState.lastRunLabel {
            Text("Last run: \(lastRun)")
                .foregroundStyle(.secondary)
        }

        if let error = appState.errorMessage {
            Text(error)
                .foregroundStyle(.red)
        }

        Divider()

        Button("Show log\u{2026}") {
            appDelegate.showLog()
        }

        Button("Settings\u{2026}") {
            appDelegate.showSettings()
        }

        Divider()

        Toggle("Launch at login", isOn: Binding(
            get: { appState.launchAtLogin },
            set: { _ in appState.toggleLoginItem() }
        ))

        Button("Quit") {
            Task {
                await appDelegate.stopBridge()
                NSApplication.shared.terminate(nil)
            }
        }
    }
}
