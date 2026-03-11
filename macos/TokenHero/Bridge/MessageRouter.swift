import Foundation
import WebSocketKit

@MainActor
final class MessageRouter {
    private let appState: AppState
    private let bridge: WebSocketBridge
    private let logger = TokenHeroLogger.shared

    init(appState: AppState, bridge: WebSocketBridge) {
        self.appState = appState
        self.bridge = bridge
    }

    func handleMessage(ws: WebSocket, text: String) {
        guard let data = text.data(using: .utf8) else { return }

        let message: BridgeMessage
        do {
            message = try JSONDecoder().decode(BridgeMessage.self, from: data)
        } catch {
            Task { await logger.log(.warn, "Failed to decode message: \(error.localizedDescription)") }
            return
        }

        Task { @MainActor in
            await routeMessage(ws: ws, message: message)
        }
    }

    private func routeMessage(ws: WebSocket, message: BridgeMessage) async {
        switch message.type {
        case MessageType.hello:
            await HelloHandler.handle(
                ws: ws,
                message: message,
                appState: appState,
                bridge: bridge
            )

        case MessageType.saveConfig:
            await SaveConfigHandler.handle(
                ws: ws,
                message: message,
                appState: appState,
                bridge: bridge
            )

        case MessageType.getTokenSnapshot:
            await TokenSnapshotHandler.handle(
                ws: ws,
                message: message,
                appState: appState,
                bridge: bridge
            )

        case MessageType.applyPatch:
            await PatchHandler.handle(
                ws: ws,
                message: message,
                appState: appState,
                bridge: bridge
            )

        case MessageType.runScopedAudit:
            await AuditHandler.handle(
                ws: ws,
                message: message,
                appState: appState,
                bridge: bridge
            )

        case MessageType.openContactSheet:
            await ContactSheetHandler.handle(
                ws: ws,
                message: message,
                appState: appState,
                bridge: bridge
            )

        case MessageType.saveMapping:
            await SaveMappingHandler.handle(
                ws: ws,
                message: message,
                appState: appState,
                bridge: bridge
            )

        case MessageType.pickFolder:
            await PickFolderHandler.handle(
                ws: ws,
                message: message,
                appState: appState,
                bridge: bridge
            )

        case MessageType.getComponentProperties:
            await ComponentPropertiesHandler.handle(
                ws: ws,
                message: message,
                appState: appState,
                bridge: bridge
            )

        case MessageType.componentPropertiesResult:
            await ComponentPropertiesHandler.handleResult(
                ws: ws,
                message: message,
                bridge: bridge
            )

        default:
            await logger.log(.warn, "Unknown message type: \(message.type)")
            let errorPayload: JSONValue = .object([
                "correlationId": .string(message.id),
                "code": .string("UNKNOWN"),
                "message": .string("Unknown message type: \(message.type)"),
            ])
            let response = BridgeMessage(type: MessageType.error, payload: errorPayload)
            await bridge.send(to: ws, message: response)
        }
    }
}
