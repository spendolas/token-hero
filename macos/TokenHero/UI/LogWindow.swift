import SwiftUI

struct LogWindow: View {
    @State private var logContent: String = ""

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                Text(logContent)
                    .font(.system(.caption, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .textSelection(.enabled)
                    .id("logContent")
            }
            .onChange(of: logContent) { _, _ in
                proxy.scrollTo("logContent", anchor: .bottom)
            }
        }
        .frame(width: 600, height: 400)
        .task {
            refreshLog()
            // Auto-refresh every 2 seconds
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                refreshLog()
            }
        }
    }

    @MainActor
    private func refreshLog() {
        Task {
            let content = await TokenHeroLogger.shared.readLastLines(200)
            logContent = content
        }
    }
}
