import Foundation
import AppKit
import WebSocketKit

enum ContactSheetHandler {
    static func handle(
        ws: WebSocket,
        message: BridgeMessage,
        appState: AppState,
        bridge: WebSocketBridge
    ) async {
        let logger = TokenHeroLogger.shared

        guard let config = await MainActor.run(body: { appState.currentConfig }),
              let contactSheetUrl = config.pipeline.contactSheetUrl,
              !contactSheetUrl.isEmpty else {
            await logger.log(.warn, "OPEN_CONTACT_SHEET: no contact sheet URL configured")
            return
        }

        let jsonKey = message.payload["jsonKey"]?.stringValue ?? ""
        let urlString = "\(contactSheetUrl)#\(jsonKey)"

        guard let url = URL(string: urlString) else {
            await logger.log(.error, "OPEN_CONTACT_SHEET: invalid URL \(urlString)")
            return
        }

        await MainActor.run {
            NSWorkspace.shared.open(url)
        }
        await logger.log(.info, "Opened contact sheet: \(urlString)")
    }
}
