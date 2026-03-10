import SwiftUI

@main
struct TokenHeroApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var appState = AppState()
    @State private var pulseOpacity: Double = 1.0
    @State private var didInit = false

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(appState: appState, appDelegate: appDelegate)
                .onOpenURL { url in
                    appDelegate.handleDeepLink(url)
                }
        } label: {
            Image(systemName: appState.iconState.symbolName)
                .foregroundStyle(appState.iconState.tintColor)
                .opacity(appState.iconState.isPulsing ? pulseOpacity : 1.0)
                .task {
                    guard !didInit else { return }
                    didInit = true
                    appDelegate.appState = appState
                    appDelegate.startBridge()
                }
                .onChange(of: appState.iconState.isPulsing) { _, isPulsing in
                    if isPulsing {
                        withAnimation(.linear(duration: 0.5).repeatForever(autoreverses: true)) {
                            pulseOpacity = 0.3
                        }
                    } else {
                        withAnimation(.linear(duration: 0.2)) {
                            pulseOpacity = 1.0
                        }
                    }
                }
        }
    }
}
