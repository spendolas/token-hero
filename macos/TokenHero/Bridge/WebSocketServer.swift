import Foundation
import NIOCore
import NIOPosix
import NIOHTTP1
import NIOWebSocket
import WebSocketKit

// ── CORS + Private Network Access preflight handler ─────────────
// Chrome requires an OPTIONS preflight with Access-Control-Allow-Private-Network
// before allowing ws:// connections from a public origin (figma.com) to localhost.

private final class CORSHandler: ChannelInboundHandler, RemovableChannelHandler, Sendable {
    typealias InboundIn = HTTPServerRequestPart
    typealias OutboundOut = HTTPServerResponsePart

    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        let part = unwrapInboundIn(data)
        guard case .head(let head) = part else { return }

        if head.method == .OPTIONS {
            var headers = HTTPHeaders()
            headers.add(name: "Access-Control-Allow-Origin", value: "*")
            headers.add(name: "Access-Control-Allow-Methods", value: "GET, OPTIONS")
            headers.add(name: "Access-Control-Allow-Headers", value: "*")
            headers.add(name: "Access-Control-Allow-Private-Network", value: "true")
            headers.add(name: "Content-Length", value: "0")

            let response = HTTPResponseHead(version: head.version, status: .noContent, headers: headers)
            context.write(wrapOutboundOut(.head(response)), promise: nil)
            context.writeAndFlush(wrapOutboundOut(.end(nil))).whenComplete { _ in
                context.close(promise: nil)
            }
        } else {
            // Non-OPTIONS, non-upgrade request — just close
            context.close(promise: nil)
        }
    }
}

// ─────────────────────────────────────────────────────────────────

actor WebSocketBridge {
    private var eventLoopGroup: MultiThreadedEventLoopGroup?
    private var serverChannel: (any Channel)?
    private var clients: [ObjectIdentifier: WebSocket] = [:]
    private var isRunning = false
    private let onConnect: @Sendable (Int) -> Void
    private let onDisconnect: @Sendable (Int) -> Void
    private let onMessage: @Sendable (WebSocket, String) -> Void

    init(
        onConnect: @escaping @Sendable (Int) -> Void,
        onDisconnect: @escaping @Sendable (Int) -> Void,
        onMessage: @escaping @Sendable (WebSocket, String) -> Void
    ) {
        self.onConnect = onConnect
        self.onDisconnect = onDisconnect
        self.onMessage = onMessage
    }

    var clientCount: Int {
        clients.count
    }

    func start(port: Int) async throws {
        guard !isRunning else { return }

        let elg = MultiThreadedEventLoopGroup(numberOfThreads: 2)
        self.eventLoopGroup = elg

        let onConnect = self.onConnect
        let onDisconnect = self.onDisconnect
        let onMessage = self.onMessage
        nonisolated(unsafe) let bridgeRef = self

        let upgrader = NIOWebSocketServerUpgrader(
            shouldUpgrade: { channel, head in
                var headers = HTTPHeaders()
                headers.add(name: "Access-Control-Allow-Origin", value: "*")
                headers.add(name: "Access-Control-Allow-Private-Network", value: "true")
                return channel.eventLoop.makeSucceededFuture(headers)
            },
            upgradePipelineHandler: { channel, _ in
                // Remove CORS handler — only needed for HTTP preflight, not WebSocket
                channel.pipeline.removeHandler(name: "cors", promise: nil)

                return WebSocket.server(on: channel) { ws in
                    let id = ObjectIdentifier(ws)

                    Task {
                        await bridgeRef.addClient(id: id, ws: ws)
                        let count = await bridgeRef.clientCount
                        await TokenHeroLogger.shared.log(.info, "WebSocket client connected (clients: \(count))")
                        onConnect(count)
                    }

                    ws.onText { ws, text in
                        onMessage(ws, text)
                    }

                    // Built-in ping/pong heartbeat — closes dead connections with code 1006
                    ws.pingInterval = .seconds(10)

                    ws.onClose.whenComplete { _ in
                        Task {
                            await bridgeRef.removeClient(id: id)
                            let count = await bridgeRef.clientCount
                            await TokenHeroLogger.shared.log(.info, "WebSocket client disconnected (clients: \(count))")
                            onDisconnect(count)
                        }
                    }
                }
            }
        )

        let upgradeConfig: NIOHTTPServerUpgradeSendableConfiguration = (
            upgraders: [upgrader],
            completionHandler: { _ in
                // Don't close — let CORSHandler respond to OPTIONS preflight
            }
        )

        let channel = try await ServerBootstrap(group: elg)
            .serverChannelOption(.backlog, value: 256)
            .serverChannelOption(.socketOption(.so_reuseaddr), value: 1)
            .childChannelInitializer { channel in
                channel.pipeline.configureHTTPServerPipeline(withServerUpgrade: upgradeConfig).flatMap {
                    channel.pipeline.addHandler(CORSHandler(), name: "cors")
                }
            }
            .bind(host: "127.0.0.1", port: port)
            .get()

        self.serverChannel = channel
        isRunning = true
    }

    func stop() async {
        let closingMessage = BridgeMessage(
            type: MessageType.bridgeClosing,
            payload: .object(["reason": .string("shutdown")])
        )
        if let data = try? JSONEncoder().encode(closingMessage),
           let text = String(data: data, encoding: .utf8) {
            for (_, ws) in clients {
                try? await ws.send(text)
            }
        }

        for (_, ws) in clients {
            try? await ws.close()
        }
        clients.removeAll()

        try? await serverChannel?.close()
        serverChannel = nil

        try? await eventLoopGroup?.shutdownGracefully()
        eventLoopGroup = nil
        isRunning = false
    }

    func send(to ws: WebSocket, message: BridgeMessage) async {
        guard let data = try? JSONEncoder().encode(message),
              let text = String(data: data, encoding: .utf8) else { return }
        try? await ws.send(text)
    }

    func broadcast(message: BridgeMessage) async {
        guard let data = try? JSONEncoder().encode(message),
              let text = String(data: data, encoding: .utf8) else { return }
        for (_, ws) in clients {
            try? await ws.send(text)
        }
    }

    func addClient(id: ObjectIdentifier, ws: WebSocket) {
        clients[id] = ws
    }

    func removeClient(id: ObjectIdentifier) {
        clients.removeValue(forKey: id)
    }
}
