import SwiftUI

struct SettingsWindow: View {
    @Bindable var appState: AppState
    let appDelegate: AppDelegate

    @State private var portText: String = "7799"
    @State private var portError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Bridge port")
                TextField("7799", text: $portText)
                    .frame(width: 70)
                    .onChange(of: portText) { _, newValue in
                        validateAndApplyPort(newValue)
                    }
                if let error = portError {
                    Text(error).foregroundStyle(.red).font(.caption)
                }
            }

            HStack(spacing: 4) {
                Circle()
                    .fill(appState.connectedPluginCount > 0 ? Color.green : Color.secondary)
                    .frame(width: 6, height: 6)
                Text(appState.connectedPluginCount > 0 ? "Plugin connected" : "No plugin connected")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(20)
        .frame(width: 380, height: 100)
        .onAppear {
            portText = String(appState.bridgePort)
        }
    }

    private func validateAndApplyPort(_ value: String) {
        guard let port = Int(value), port >= 1024, port <= 65535 else {
            portError = "1024\u{2013}65535"
            return
        }
        portError = nil
        if port != appState.bridgePort {
            appState.bridgePort = port
            appDelegate.restartBridge()
        }
    }
}
